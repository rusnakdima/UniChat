//! Overlay WebSocket handlers module
//! Handles WebSocket connections for overlay subscribers and message sources

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

use crate::helpers::message_sanitizer_helper::sanitize_for_overlay;
use crate::models::overlay_message_model::{
  OverlayMessageModel, OverlayWidgetFilterModel, OverlayWsIncomingModel, OverlayWsSubscribeModel,
};
use crate::services::overlay_server::overlay_subscriber_manager::{
  OverlayServerState, OverlaySubscriber,
};

/// Query parameters for overlay WebSocket connections
#[derive(Clone, Debug, serde::Deserialize)]
pub struct OverlayWsQuery {
  pub role: String,
  pub widget_id: Option<String>,
}

/// Route WebSocket connection to appropriate handler based on role
pub async fn handle_overlay_ws(ws: WebSocket, query: OverlayWsQuery, state: OverlayServerState) {
  if query.role == "overlay" {
    if let Some(widget_id) = query.widget_id {
      handle_overlay_subscriber(ws, widget_id, state).await;
      return;
    }
  }

  if query.role == "source" {
    handle_overlay_source(ws, state).await;
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
  let send_task = tokio::task::spawn(async move {
    while let Some(msg) = out_rx.recv().await {
      if ws_sender.send(msg).await.is_err() {
        break;
      }
    }
  });

  let widget_id_for_removal = widget_id.clone();
  let mut subscribed = false;

  while let Some(Ok(msg)) = ws_receiver.next().await {
    match msg {
      Message::Text(text) => {
        if let Ok(incoming) = serde_json::from_str::<OverlayWsIncomingModel>(&text) {
          if incoming.kind == "subscribe" && !subscribed {
            if let Some(subscribe) = incoming.subscribe {
              handle_subscribe_message(subscribe, &filter, &channel_ids).await;
              let channel_ids_clone = {
                let guard = channel_ids.read().await;
                (*guard).clone()
              };
              state
                .add_subscriber(widget_id.clone(), sub.clone(), channel_ids_clone)
                .await;
              subscribed = true;
            }
          }
        }
      }
      Message::Close(_) => break,
      _ => {}
    }
  }

  state
    .remove_subscriber(&widget_id_for_removal, subscriber_id)
    .await;
  send_task.abort();
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
async fn handle_overlay_source(ws: WebSocket, state: OverlayServerState) {
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
                channel_image_url: None,
                emotes: message.emotes,
              };
              state.broadcast_message(overlay_message).await;
            }
          }
        }
      }
      Message::Close(_) => break,
      _ => {}
    }
  }
}
