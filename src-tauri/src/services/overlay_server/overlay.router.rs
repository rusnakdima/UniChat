//! Overlay server router module
//! Builds the Axum router for overlay HTTP and WebSocket endpoints

use axum::{
  extract::{Path, Query, WebSocketUpgrade},
  response::Html,
  routing::get,
  Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use std::path::PathBuf;
use tower_http::services::ServeDir;

use crate::routes::overlay_route::{OVERLAY_CONFIGS, OVERLAY_MESSAGES};
use crate::services::overlay_server::overlay_subscriber_manager::OverlayServerState;
use crate::services::overlay_server::overlay_ws_handlers::{handle_overlay_ws, OverlayWsQuery};

/// Query parameters for get_overlay_messages endpoint
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetOverlayMessagesQuery {
  pub limit: Option<u32>,
  pub channel_ids: Option<Vec<String>>,
}

/// Serve the overlay index.html with transparent background support for OBS
async fn serve_overlay_index(dist_dir: PathBuf) -> Html<String> {
  let index_path = dist_dir.join("index.html");
  match std::fs::read_to_string(&index_path) {
    Ok(mut html) => {
      // Inject transparent background CSS before </head> for OBS browser source compatibility
      let transparent_css = r#"
<style>
  /* Force transparent background for overlay - required for OBS browser source */
  html, body { background: transparent !important; background-color: transparent !important; }
  :root { background: transparent !important; }
  app-root { background: transparent !important; }
  app-overlay-view { background: transparent !important; }
</style>"#;

      // Insert transparent CSS before </head>
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

/// Get overlay messages for a widget
async fn get_overlay_messages(
  Path(widget_id): Path<String>,
  Query(query): Query<GetOverlayMessagesQuery>,
) -> Json<Vec<serde_json::Value>> {
  use crate::models::overlay_message_model::OverlayMessageModel;

  let messages = OVERLAY_MESSAGES.read().await;
  let Some(widget_messages) = messages.get(&widget_id) else {
    return Json(Vec::new());
  };

  let mut result: Vec<OverlayMessageModel> = widget_messages.clone();

  // Apply channel filter if specified
  if let Some(ids) = query.channel_ids {
    if !ids.is_empty() {
      result.retain(|msg| {
        let channel_ref = format!("{}:{}", msg.platform, msg.source_channel_id);
        ids.contains(&channel_ref)
      });
    }
  }

  // Sort by timestamp (newest first)
  result.sort_by(|a, b| {
    let a_time = a.timestamp.parse::<i64>().unwrap_or(0);
    let b_time = b.timestamp.parse::<i64>().unwrap_or(0);
    b_time.cmp(&a_time)
  });

  // Apply limit
  let limit_value = query.limit.unwrap_or(50) as usize;
  if result.len() > limit_value {
    result.truncate(limit_value);
  }

  // Convert to JSON values
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
    .route(
      "/api/overlay/:widget_id/messages",
      get(get_overlay_messages),
    )
    .fallback_service(serve_dir)
}
