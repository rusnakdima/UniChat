use crate::models::overlay_message_model::OverlayMessageModel;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayServerStartResultModel {
  pub port: u16,
  pub base_url: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayConfigChangedModel {
  pub widget_id: String,
  pub timestamp: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayFullConfigModel {
  pub widget_id: String,
  pub filter: String,
  pub custom_css: String,
  pub channel_ids: Vec<String>,
  pub text_size: u32,
  pub animation_type: String,
  pub animation_direction: String,
  pub max_messages: u32,
  pub transparent_bg: bool,
  pub timestamp: u64,
}

/// Start the local overlay HTTP/WS server on `127.0.0.1:<port>`.
#[tauri::command]
pub async fn startOverlayServer(
  port: u16,
  state: tauri::State<'_, crate::AppState>,
) -> Result<OverlayServerStartResultModel, String> {
  state.overlayServerService.clone().start(port).await?;

  Ok(OverlayServerStartResultModel {
    port,
    base_url: format!("http://127.0.0.1:{port}"),
  })
}

/// Stop the local overlay HTTP/WS server.
#[tauri::command]
pub async fn stopOverlayServer(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
  state.overlayServerService.clone().stop().await
}

/// Compute the overlay URL (same format Angular helper uses).
#[tauri::command]
pub fn getOverlayUrl(port: u16, widgetId: String) -> Result<String, String> {
  if widgetId.trim().is_empty() {
    return Err("widgetId required".to_string());
  }

  Ok(format!(
    "http://127.0.0.1:{port}/overlay?widgetId={}",
    widgetId.trim()
  ))
}

/// Open the overlay in a new native window with transparency support.
#[tauri::command]
pub async fn openOverlayWindow(
  app: tauri::AppHandle,
  port: u16,
  widget_id: String,
  transparent_bg: bool,
) -> Result<(), String> {
  use tauri::{WebviewUrl, WebviewWindowBuilder};

  if widget_id.trim().is_empty() {
    return Err("widgetId required".to_string());
  }

  // Pass widgetId in URL for overlay to read
  let overlay_url = format!(
    "http://127.0.0.1:{port}/overlay?widgetId={}",
    widget_id.trim()
  );
  let window_label = format!("overlay-{}", widget_id.trim());

  // Check if window already exists
  if let Some(existing) = app.get_webview_window(&window_label) {
    existing.set_focus().map_err(|e| e.to_string())?;
    return Ok(());
  }

  // Create new overlay window with transparency support
  let _window = WebviewWindowBuilder::new(
    &app,
    &window_label,
    WebviewUrl::External(overlay_url.parse().unwrap()),
  )
  .title("UniChat Overlay Preview")
  .inner_size(500.0, 700.0)
  .resizable(true)
  .decorations(!transparent_bg) // Remove decorations for transparent overlay
  .always_on_top(true)
  .transparent(transparent_bg) // Enable window transparency
  .visible(true)
  .build()
  .map_err(|e| e.to_string())?;

  Ok(())
}

use lazy_static::lazy_static;
/// Overlay configuration storage for cross-window sync
use std::collections::HashMap;
use tokio::sync::RwLock;

lazy_static! {
  pub static ref OVERLAY_CONFIGS: RwLock<HashMap<String, OverlayFullConfigModel>> =
    RwLock::new(HashMap::new());
  pub static ref OVERLAY_MESSAGES: RwLock<HashMap<String, Vec<OverlayMessageModel>>> =
    RwLock::new(HashMap::new());
}

/// Emit overlay configuration changed event to all windows and store in backend.
#[tauri::command]
pub async fn emitOverlayConfigChanged(
  app: tauri::AppHandle,
  widget_id: String,
  timestamp: u64,
  filter: String,
  custom_css: String,
  channel_ids: Vec<String>,
  text_size: u32,
  animation_type: String,
  animation_direction: String,
  max_messages: u32,
  transparent_bg: bool,
) -> Result<(), String> {
  // Store full config in backend for overlay windows to fetch
  let config = OverlayFullConfigModel {
    widget_id: widget_id.clone(),
    filter,
    custom_css,
    channel_ids,
    text_size,
    animation_type,
    animation_direction,
    max_messages,
    transparent_bg,
    timestamp,
  };

  {
    let mut configs = OVERLAY_CONFIGS.write().await;
    configs.insert(widget_id.clone(), config);
  }

  // Emit event to all windows
  app
    .emit(
      "overlay-config-changed",
      OverlayConfigChangedModel {
        widget_id,
        timestamp,
      },
    )
    .map_err(|e| e.to_string())?;
  Ok(())
}

/// Get stored overlay config for a widget
#[tauri::command]
pub async fn getOverlayConfig(widget_id: String) -> Result<Option<OverlayFullConfigModel>, String> {
  let configs = OVERLAY_CONFIGS.read().await;
  Ok(configs.get(&widget_id).cloned())
}

/// Send a message to overlay storage for a widget
#[tauri::command]
pub async fn sendOverlayMessage(
  widget_id: String,
  message: OverlayMessageModel,
) -> Result<(), String> {
  let mut messages = OVERLAY_MESSAGES.write().await;

  let widget_messages = messages.entry(widget_id.clone()).or_insert_with(Vec::new);

  // Check if message already exists (update instead of duplicate)
  if let Some(existing) = widget_messages.iter_mut().find(|m| m.id == message.id) {
    *existing = message.clone();
  } else {
    // Add new message, keep only last 100
    widget_messages.push(message.clone());
    if widget_messages.len() > 100 {
      widget_messages.remove(0);
    }
  }

  Ok(())
}

/// Get messages for a widget (returns most recent messages up to limit, filtered by channel IDs if provided)
/// Channel IDs use composite key format: "platform:channelName" (e.g., "twitch:bratishkinoff")
#[tauri::command]
pub async fn getOverlayMessages(
  widget_id: String,
  limit: usize,
  channel_ids: Option<Vec<String>>,
) -> Result<Vec<OverlayMessageModel>, String> {
  let messages = OVERLAY_MESSAGES.read().await;

  let widget_messages = messages.get(&widget_id);

  if let Some(msgs) = widget_messages {
    // Filter by channel IDs if provided
    let filtered: Vec<OverlayMessageModel> = if let Some(ids) = &channel_ids {
      if ids.is_empty() {
        // Empty channel list means no channels selected - return empty
        Vec::new()
      } else {
        // Only return messages from enabled channels
        // Use composite key (platform:source_channel_id) to match filter
        msgs
          .iter()
          .filter(|m| {
            let composite_key = format!("{}:{}", m.platform, m.source_channel_id);
            ids.contains(&composite_key)
          })
          .cloned()
          .collect()
      }
    } else {
      // No channel filter provided - return all messages
      msgs.clone()
    };

    // Return messages sorted by timestamp (newest first), limited to count
    let mut sorted = filtered;
    sorted.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(sorted.into_iter().take(limit).collect())
  } else {
    Ok(Vec::new())
  }
}
