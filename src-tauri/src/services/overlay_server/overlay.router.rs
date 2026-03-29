//! Overlay server router module
//! Builds the Axum router for overlay HTTP and WebSocket endpoints

use axum::{
  extract::{Path, Query, WebSocketUpgrade},
  response::Html,
  routing::get,
  Json, Router,
};
use serde_json::json;
use std::path::PathBuf;
use tower_http::services::ServeDir;

use crate::routes::overlay_route::OVERLAY_CONFIGS;
use crate::services::overlay_server::overlay_subscriber_manager::OverlayServerState;
use crate::services::overlay_server::overlay_ws_handlers::{handle_overlay_ws, OverlayWsQuery};

/// Serve the overlay index.html
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

/// Get overlay config for a widget
async fn get_overlay_config(Path(widget_id): Path<String>) -> Json<serde_json::Value> {
  let configs = OVERLAY_CONFIGS.read().await;
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

/// Build the overlay server router
pub fn build_overlay_router(dist_dir: PathBuf, state: OverlayServerState) -> Router {
  let serve_dir = ServeDir::new(dist_dir.clone()).append_index_html_on_directories(false);

  let ws_state = state.clone();
  let overlay_dist = dist_dir.clone();

  Router::new()
    .route(
      "/ws/overlay",
      get(
        move |ws: WebSocketUpgrade, Query(query): Query<OverlayWsQuery>| {
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
    .route("/api/overlay/:widget_id/config", get(get_overlay_config))
    .fallback_service(serve_dir)
}
