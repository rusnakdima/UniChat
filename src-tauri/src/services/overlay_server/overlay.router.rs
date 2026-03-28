//! Overlay server router module
//! Builds the Axum router for overlay HTTP and WebSocket endpoints

use axum::{
  extract::{Path, Query, WebSocketUpgrade},
  http::StatusCode,
  response::{Html, IntoResponse, Json},
  routing::get,
  Router,
};
use std::path::PathBuf;
use tower_http::services::ServeDir;

use crate::routes::overlay_route::{OverlayFullConfigModel, OVERLAY_CONFIGS};
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

/// Custom 404 handler for missing static files
async fn not_found() -> impl IntoResponse {
  (StatusCode::NOT_FOUND, Html("<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1><p>The requested resource was not found.</p></body></html>"))
}

/// Build the overlay server router
pub fn build_overlay_router(dist_dir: PathBuf, state: OverlayServerState) -> Router {
  let serve_dir = ServeDir::new(dist_dir.clone())
    .append_index_html_on_directories(false)
    .not_found_service(axum::routing::get(not_found));

  let ws_state = state.clone();
  let overlay_dist = dist_dir.clone();
  let config_state = state.clone();

  Router::new()
    .route(
      "/api/overlay/:widget_id/config",
      get(move |path: Path<String>| handle_get_overlay_config(config_state.clone(), path)),
    )
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
    .fallback_service(serve_dir)
}

/// Handle GET request for overlay configuration
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
