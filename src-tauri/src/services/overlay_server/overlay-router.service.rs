//! Overlay server router module
//! Builds the Axum router for overlay HTTP and WebSocket endpoints

use std::{collections::HashMap, path::PathBuf, sync::Arc};

use axum::{
  extract::{Path, Query, State, WebSocketUpgrade},
  response::Html,
  routing::get,
  Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::RwLock;
use tower_http::services::ServeDir;

use crate::commands::overlay_command::OverlayFullConfigModel;
use crate::models::overlay_message_model::OverlayMessageModel;
use crate::services::overlay_server::overlay_helpers::filter_and_sort_messages;
use crate::services::overlay_server::overlay_subscriber_manager::OverlayServerState;
use crate::services::overlay_server::overlay_ws_handlers::{handle_overlay_ws, OverlayWsQuery};

/// Query parameters for get_overlay_messages endpoint
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetOverlayMessagesQuery {
  pub limit: Option<u32>,
  pub channel_ids: Option<Vec<String>>,
}

#[derive(Clone)]
pub struct OverlayRouterState {
  pub overlay_configs: Arc<RwLock<HashMap<String, OverlayFullConfigModel>>>,
  pub overlay_messages: Arc<RwLock<HashMap<String, Vec<OverlayMessageModel>>>>,
}

/// Serve the overlay index.html with transparent background support for OBS
async fn serve_overlay_index(dist_dir: State<Arc<PathBuf>>) -> Html<String> {
  let index_path = dist_dir.join("index.html");
  match std::fs::read_to_string(&index_path) {
    Ok(mut html) => {
      let transparent_css = r#"
<style>
  html, body { background: transparent !important; background-color: transparent !important; }
  :root { background: transparent !important; }
  app-root { background: transparent !important; }
  app-overlay-view { background: transparent !important; }
</style>"#;

      if let Some(head_end) = html.find("</head>") {
        html.insert_str(head_end, transparent_css);
      }

      Html(html)
    }
    Err(_) => Html(format!(
      "<pre>Overlay dist missing: {}</pre>",
      index_path.display()
    )),
  }
}

async fn get_overlay_config(
  Path(widget_id): Path<String>,
  State(state): State<OverlayRouterState>,
) -> Json<serde_json::Value> {
  let configs = state.overlay_configs.read().await;
  if let Some(config) = configs.get(&widget_id) {
    Json(json!({
      "widgetId": config.widget_id,
      "filter": config.filter,
      "customCss": config.custom_css,
      "channelIds": config.channel_ids,
      "textSize": config.text_size,
      "animationType": config.animation_type,
      "animationDirection": config.animation_direction,
      "maxMessages": config.max_messages,
      "transparentBg": config.transparent_bg
    }))
  } else {
    Json(json!(null))
  }
}

async fn get_overlay_messages(
  Path(widget_id): Path<String>,
  Query(query): Query<GetOverlayMessagesQuery>,
  State(state): State<OverlayRouterState>,
) -> Json<Vec<serde_json::Value>> {
  let messages = state.overlay_messages.read().await;
  let Some(widget_messages) = messages.get(&widget_id) else {
    return Json(Vec::new());
  };

  let result = filter_and_sort_messages(widget_messages, query.channel_ids.as_ref(), query.limit);

  let json_result: Vec<serde_json::Value> = result
    .into_iter()
    .map(|msg| {
      json!({
        "id": msg.id,
        "platform": msg.platform,
        "author": msg.author,
        "text": msg.text,
        "timestamp": msg.timestamp,
        "isSupporter": msg.is_supporter,
        "sourceChannelId": msg.source_channel_id,
        "authorAvatarUrl": msg.author_avatar_url,
        "channelImageUrl": msg.channel_image_url,
        "emotes": msg.emotes
      })
    })
    .collect();

  Json(json_result)
}

pub fn build_overlay_router(
  dist_dir: PathBuf,
  state: OverlayServerState,
  overlay_configs: Arc<RwLock<HashMap<String, OverlayFullConfigModel>>>,
  overlay_messages: Arc<RwLock<HashMap<String, Vec<OverlayMessageModel>>>>,
) -> Router {
  let serve_dir = ServeDir::new(dist_dir.clone()).append_index_html_on_directories(false);

  let ws_state = state.clone();
  let overlay_dist = dist_dir.clone();
  let router_state = OverlayRouterState {
    overlay_configs,
    overlay_messages,
  };
  let router_state_for_ws = router_state.clone();

  Router::new()
    .route(
      "/ws/overlay",
      get(
        move |ws: WebSocketUpgrade, Query(query): Query<OverlayWsQuery>| {
          let state = ws_state.clone();
          let router_state = router_state_for_ws.clone();
          async move {
            ws.on_upgrade(move |socket| handle_overlay_ws(socket, query, state, router_state))
          }
        },
      ),
    )
    .route(
      "/overlay",
      get({
        let dist = Arc::new(overlay_dist.clone());
        move || {
          let dist = dist.clone();
          async move { serve_overlay_index(State(dist)).await }
        }
      }),
    )
    .route("/api/overlay/:widget_id/config", get(get_overlay_config))
    .route(
      "/api/overlay/:widget_id/messages",
      get(get_overlay_messages),
    )
    .with_state(router_state)
    .fallback_service(serve_dir)
}
