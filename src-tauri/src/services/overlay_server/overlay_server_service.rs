use axum::{
  extract::{
    ws::{Message, WebSocket, WebSocketUpgrade},
    Path, Query,
  },
  http::StatusCode,
  response::{Html, IntoResponse, Json},
  routing::get,
  Router,
};
use futures_util::{SinkExt, StreamExt};
use std::{collections::HashMap, net::SocketAddr, path::PathBuf, sync::Arc};
use tokio::sync::{mpsc, oneshot, RwLock};

use crate::{
  helpers::message_sanitizer_helper::sanitizeForOverlay,
  models::overlay_message_model::{
    OverlayMessageModel, OverlayWidgetFilterModel, OverlayWsIncomingModel, OverlayWsOutgoingModel,
    OverlayWsSubscribeModel,
  },
  routes::overlay_route::{OverlayFullConfigModel, OVERLAY_CONFIGS},
};

use tower_http::services::ServeDir;

#[derive(Clone, Debug)]
struct OverlaySubscriber {
  id: u64,
  filter: Arc<RwLock<OverlayWidgetFilterModel>>,
  channel_ids: Arc<RwLock<Option<Vec<String>>>>,
  tx: mpsc::UnboundedSender<Message>,
}

#[derive(Clone, Debug, Default)]
struct OverlayServerState {
  overlay_subscribers: Arc<tokio::sync::Mutex<HashMap<String, Vec<OverlaySubscriber>>>>,
}

impl OverlayServerState {
  async fn add_overlay_subscriber(
    &self,
    widget_id: String,
    sub: OverlaySubscriber,
    channel_ids: Option<Vec<String>>,
  ) {
    let mut map = self.overlay_subscribers.lock().await;
    // Store channel_ids in the subscriber
    if let Some(ids) = channel_ids {
      *sub.channel_ids.write().await = Some(ids);
    }
    map.entry(widget_id).or_default().push(sub);
  }

  async fn remove_overlay_subscriber(&self, widget_id: &str, subscriber_id: u64) {
    let mut map = self.overlay_subscribers.lock().await;
    if let Some(vec) = map.get_mut(widget_id) {
      vec.retain(|s| s.id != subscriber_id);
    }
  }

  async fn broadcast_overlay_message(&self, message: OverlayMessageModel) {
    // Sanitize should happen upstream; keep this broadcast fast.
    let overlay_json = OverlayWsOutgoingModel {
      kind: "overlayMessage".to_string(),
      message: Some(message.clone()),
    };
    let text = serde_json::to_string(&overlay_json)
      .unwrap_or_else(|_| "{\"type\":\"overlayMessage\"}".to_string());

    let snapshot: Vec<OverlaySubscriber> = {
      let map = self.overlay_subscribers.lock().await;
      map.values().flat_map(|vec| vec.clone()).collect()
    };

    for sub in snapshot {
      // Filter check: match supporters-only widgets.
      let filter: OverlayWidgetFilterModel = sub.filter.read().await.clone();
      let allowed = match filter {
        OverlayWidgetFilterModel::All => true,
        OverlayWidgetFilterModel::Supporters => message.is_supporter,
      };
      if !allowed {
        continue;
      }

      // Channel filter check: if channel_ids is set, only allow messages from those channels
      let channel_ids = sub.channel_ids.read().await;
      let channel_allowed = match &*channel_ids {
        None => true, // No filter = all channels allowed
        Some(ids) => ids.contains(&message.source_channel_id),
      };
      if !channel_allowed {
        continue;
      }

      let _ = sub.tx.send(Message::Text(text.clone().into()));
    }
  }
}

pub struct OverlayServerService {
  frontend_dist_dir: PathBuf,
  state: OverlayServerState,
  server_instance: tokio::sync::Mutex<Option<OverlayServerInstance>>,
}

struct OverlayServerInstance {
  shutdown_tx: oneshot::Sender<()>,
}

impl OverlayServerService {
  pub fn new(frontend_dist_dir: PathBuf) -> Self {
    Self {
      frontend_dist_dir,
      state: OverlayServerState::default(),
      server_instance: tokio::sync::Mutex::new(None),
    }
  }

  pub async fn start(self: Arc<Self>, port: u16) -> Result<(), String> {
    let mut guard = self.server_instance.lock().await;
    if guard.is_some() {
      return Ok(());
    }

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let state = self.state.clone();
    let dist_dir = self.frontend_dist_dir.clone();

    tokio::task::spawn(async move {
      let router = build_overlay_router(dist_dir, state);
      let addr = SocketAddr::from(([127, 0, 0, 1], port));
      let listener = tokio::net::TcpListener::bind(addr).await;

      if let Ok(listener) = listener {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
          let _ = shutdown_rx.await;
        });
        let _ = server.await;
      }
    });

    *guard = Some(OverlayServerInstance { shutdown_tx });
    Ok(())
  }

  pub async fn stop(self: Arc<Self>) -> Result<(), String> {
    let mut guard = self.server_instance.lock().await;
    if let Some(instance) = guard.take() {
      let _ = instance.shutdown_tx.send(());
    }
    Ok(())
  }
}

#[derive(Clone, Debug, serde::Deserialize)]
struct OverlayWsQueryModel {
  role: String,
  widgetId: Option<String>,
}

async fn serve_overlay_index(dist_dir: PathBuf) -> Html<String> {
  let index_path = dist_dir.join("index.html");
  match std::fs::read_to_string(&index_path) {
    Ok(html) => Html(html),
    Err(_) => Html(format!(
      "<pre>Overlay dist missing: {}</pre>",
      index_path.display()
    )),
  }
}

/// Custom 404 handler for missing static files.
/// Returns a proper 404 status instead of a 500 error.
async fn not_found() -> impl IntoResponse {
  (StatusCode::NOT_FOUND, Html("<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1><p>The requested resource was not found.</p></body></html>"))
}

fn build_overlay_router(dist_dir: PathBuf, state: OverlayServerState) -> Router {
  // Serve static assets from the Angular dist folder.
  // The explicit `/overlay` route returns index.html to keep query params intact.
  // Configure ServeDir to not append index.html on directories (we handle /overlay explicitly)
  let serve_dir = ServeDir::new(dist_dir.clone())
    .append_index_html_on_directories(false)
    .not_found_service(axum::routing::get(not_found));
  let ws_state = state.clone();
  let overlay_dist = dist_dir.clone();
  let config_state = state.clone();

  Router::new()
    .route(
      "/api/overlay/:widgetId/config",
      get(move |path: Path<String>| handle_get_overlay_config(config_state.clone(), path)),
    )
    .route(
      "/ws/overlay",
      get(
        move |ws: WebSocketUpgrade, Query(query): Query<OverlayWsQueryModel>| {
          let state = ws_state.clone();
          async move { ws.on_upgrade(move |socket| handle_overlay_ws(socket, query, state)) }
        },
      ),
    )
    .route(
      "/overlay",
      get({
        let dist = overlay_dist.clone();
        move || {
          let dist = dist.clone();
          async move { serve_overlay_index(dist).await }
        }
      }),
    )
    .fallback_service(serve_dir)
}

async fn handle_get_overlay_config(
  _state: OverlayServerState,
  Path(widget_id): Path<String>,
) -> Result<Json<OverlayFullConfigModel>, StatusCode> {
  let configs = OVERLAY_CONFIGS.read().await;
  match configs.get(&widget_id) {
    Some(config) => Ok(Json(config.clone())),
    None => Err(StatusCode::NOT_FOUND),
  }
}

async fn handle_overlay_ws(ws: WebSocket, query: OverlayWsQueryModel, state: OverlayServerState) {
  if query.role == "overlay" {
    if let Some(widget_id) = query.widgetId {
      handle_overlay_subscriber(ws, widget_id, state).await;
      return;
    }
  }

  if query.role == "source" {
    handle_overlay_source(ws, state).await;
  }
}

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

  // Split ws stream; forward outgoing messages in a separate task.
  let (mut ws_sender, mut ws_receiver) = ws.split();
  let send_task = tokio::task::spawn(async move {
    while let Some(msg) = out_rx.recv().await {
      if ws_sender.send(msg).await.is_err() {
        break;
      }
    }
  });

  // Don't add subscriber yet; wait for subscribe message with channel_ids
  // Store widget_id for later use
  let widget_id_for_removal = widget_id.clone();

  let mut subscribed = false;
  while let Some(Ok(msg)) = ws_receiver.next().await.map(|r| r) {
    match msg {
      Message::Text(text) => {
        if let Ok(incoming) = serde_json::from_str::<OverlayWsIncomingModel>(&text) {
          if incoming.kind == "subscribe" && !subscribed {
            if let Some(subscribe) = incoming.subscribe {
              handle_subscribe_message(subscribe, &filter, &channel_ids).await;
              // Clone channel_ids before await to avoid holding the lock
              let channel_ids_clone = {
                let guard = channel_ids.read().await;
                (*guard).clone()
              };
              // Now add subscriber with channel_ids
              state
                .add_overlay_subscriber(widget_id.clone(), sub.clone(), channel_ids_clone)
                .await;
              subscribed = true;
              // Don't break - keep connection open to receive messages
            }
          }
        }
      }
      Message::Close(_) => break,
      _ => {}
    }
  }

  state
    .remove_overlay_subscriber(&widget_id_for_removal, subscriber_id)
    .await;
  send_task.abort();
}

async fn handle_subscribe_message(
  subscribe: OverlayWsSubscribeModel,
  filter: &Arc<RwLock<OverlayWidgetFilterModel>>,
  channel_ids: &Arc<RwLock<Option<Vec<String>>>>,
) {
  let next = subscribe.filter.unwrap_or(OverlayWidgetFilterModel::All);
  *filter.write().await = next;
  *channel_ids.write().await = subscribe.channel_ids;
}

async fn handle_overlay_source(ws: WebSocket, state: OverlayServerState) {
  let (_mut_ws_sender, mut ws_receiver) = ws.split();
  // Source connections currently only send; they don't receive.
  while let Some(Ok(msg)) = ws_receiver.next().await.map(|r| r) {
    match msg {
      Message::Text(text) => {
        if let Ok(incoming) = serde_json::from_str::<OverlayWsIncomingModel>(&text) {
          if incoming.kind == "chatMessage" {
            if let Some(message) = incoming.message {
              let sanitized_text = sanitizeForOverlay(&message.text);
              let overlay_message = OverlayMessageModel {
                id: message.id,
                platform: message.platform,
                author: message.author,
                text: sanitized_text,
                timestamp: message.timestamp,
                is_supporter: message.is_supporter,
                source_channel_id: message.source_channel_id,
                author_avatar_url: message.author_avatar_url,
                emotes: message.emotes,
              };
              state.broadcast_overlay_message(overlay_message).await;
            }
          }
        }
      }
      Message::Close(_) => break,
      _ => {}
    }
  }
}
