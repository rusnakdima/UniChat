//! Overlay WebSocket handlers module
//! Handles WebSocket connections for overlay subscribers and message sources

use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, RwLock};

use crate::constants::{MAX_WIDGET_IDS, MESSAGE_MAX_PER_WIDGET, WS_RECEIVE_TIMEOUT_SECS};
use crate::models::overlay_message_model::{
  OverlayMessageModel, OverlayWidgetFilterModel, OverlayWsIncomingModel, OverlayWsSubscribeModel,
};
use crate::services::overlay_server::overlay_router::OverlayRouterState;
use crate::services::overlay_server::overlay_subscriber_manager::{
  OverlayServerState, OverlaySubscriber,
};
use crate::utils::sanitizer_helper::sanitize_for_overlay;

/// Query parameters for overlay WebSocket connections
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayWsQuery {
  pub role: String,
  pub widget_id: Option<String>,
}

/// Route WebSocket connection to appropriate handler based on role
pub async fn handle_overlay_ws(
  ws: WebSocket,
  query: OverlayWsQuery,
  state: OverlayServerState,
  router_state: OverlayRouterState,
) {
  if query.role == "overlay" {
    if let Some(widget_id) = query.widget_id {
      handle_overlay_subscriber(ws, widget_id, state).await;
      return;
    }
  }

  if query.role == "source" {
    handle_overlay_source(ws, state, router_state).await;
  }
}

/// Handle overlay subscriber connection (OBS browser source)
async fn handle_overlay_subscriber(ws: WebSocket, widget_id: String, state: OverlayServerState) {
  let subscriber_id = rand::random::<u64>();
  let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Message>();

  let filter = Arc::new(RwLock::new(OverlayWidgetFilterModel::All));
  let channel_ids = Arc::new(RwLock::new(None));
  let sub = OverlaySubscriber {
    id: subscriber_id,
    filter: filter.clone(),
    channel_ids: channel_ids.clone(),
    tx: out_tx.clone(),
  };

  let (mut ws_sender, mut ws_receiver) = ws.split();

  let widget_id_for_removal = widget_id.clone();

  let send_task = tokio::task::spawn(async move {
    while let Some(msg) = out_rx.recv().await {
      if ws_sender.send(msg).await.is_err() {
        break;
      }
    }
  });

  let receive_timeout = tokio::time::Duration::from_secs(WS_RECEIVE_TIMEOUT_SECS);

  let mut subscribed = false;

  loop {
    let msg_result = tokio::time::timeout(receive_timeout, ws_receiver.next()).await;

    match msg_result {
      Ok(Some(Ok(msg))) => {
        if let Message::Close(_) = msg {
          break;
        }
        if let Message::Ping(data) = msg {
          let _ = out_tx.send(Message::Pong(data));
          continue;
        }
        if let Message::Text(text) = msg {
          subscribed = process_subscribe_text(
            &text,
            &filter,
            &channel_ids,
            &state,
            &widget_id,
            &sub,
            subscribed,
          )
          .await;
        }
      }
      Ok(Some(Err(_))) | Ok(None) => break,
      Err(_) => {
        if out_tx.send(Message::Ping(vec![])).is_err() {
          break;
        }
      }
    }
  }

  state
    .remove_subscriber(&widget_id_for_removal, subscriber_id)
    .await;
  send_task.abort();
}

async fn process_subscribe_text(
  text: &str,
  filter: &Arc<RwLock<OverlayWidgetFilterModel>>,
  channel_ids: &Arc<RwLock<Option<Vec<String>>>>,
  state: &OverlayServerState,
  widget_id: &str,
  sub: &OverlaySubscriber,
  subscribed: bool,
) -> bool {
  if subscribed {
    return subscribed;
  }

  let Ok(incoming) = serde_json::from_str::<OverlayWsIncomingModel>(text) else {
    return subscribed;
  };

  if incoming.kind != "subscribe" {
    return subscribed;
  }

  let Some(subscribe) = incoming.subscribe else {
    return subscribed;
  };

  handle_subscribe_message(subscribe, filter, channel_ids).await;

  let channel_ids_clone = {
    let guard = channel_ids.read().await;
    (*guard).clone()
  };

  *sub.channel_ids.write().await = channel_ids_clone.clone();

  state
    .add_subscriber(
      widget_id.to_string(),
      sub.clone(),
      channel_ids_clone.clone(),
    )
    .await;

  true
}

/// Handle subscribe message from overlay client
async fn handle_subscribe_message(
  subscribe: OverlayWsSubscribeModel,
  filter: &Arc<RwLock<OverlayWidgetFilterModel>>,
  channel_ids: &Arc<RwLock<Option<Vec<String>>>>,
) {
  let next = subscribe.filter.unwrap_or(OverlayWidgetFilterModel::All);
  *filter.write().await = next;
  *channel_ids.write().await = subscribe.channel_ids;
}

/// Handle message source connection (chat provider)
async fn handle_overlay_source(
  ws: WebSocket,
  state: OverlayServerState,
  router_state: OverlayRouterState,
) {
  let (_mut_ws_sender, mut ws_receiver) = ws.split();

  while let Some(Ok(msg)) = ws_receiver.next().await {
    match msg {
      Message::Text(text) => {
        if let Ok(incoming) = serde_json::from_str::<OverlayWsIncomingModel>(&text) {
          if incoming.kind == "chatMessage" {
            if let Some(message) = incoming.message {
              let sanitized_text = sanitize_for_overlay(&message.text);
              let overlay_message = OverlayMessageModel {
                id: message.id,
                platform: message.platform,
                author: message.author,
                text: sanitized_text,
                timestamp: message.timestamp,
                is_supporter: message.is_supporter,
                source_channel_id: message.source_channel_id,
                author_avatar_url: message.author_avatar_url,
                channel_image_url: message.channel_image_url,
                emotes: message.emotes,
              };
              persist_overlay_message(overlay_message.clone(), &router_state).await;
              state.broadcast_message(overlay_message).await;
            }
          }
        }
      }
      Message::Close(_) => {
        break;
      }
      _ => {}
    }
  }
}

async fn persist_overlay_message(message: OverlayMessageModel, state: &OverlayRouterState) {
  let widget_ids: Vec<String> = {
    let configs = state.overlay_configs.read().await;
    configs.keys().cloned().collect()
  };

  if widget_ids.is_empty() {
    return;
  }

  let mut messages = state.overlay_messages.write().await;

  if messages.len() >= MAX_WIDGET_IDS {
    if let Some(oldest) = widget_ids.first().cloned() {
      messages.remove(&oldest);
    }
  }

  for widget_id in widget_ids {
    let widget_messages = messages.entry(widget_id).or_insert_with(Vec::new);

    if let Some(existing) = widget_messages.iter_mut().find(|m| m.id == message.id) {
      *existing = message.clone();
    } else {
      widget_messages.push(message.clone());
      if widget_messages.len() > MESSAGE_MAX_PER_WIDGET {
        widget_messages.remove(0);
      }
    }
  }
}
