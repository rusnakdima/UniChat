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
  pub channel_ids: Option<Vec<String>>,
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
  state.overlay_server_service.clone().start(port).await?;

  Ok(OverlayServerStartResultModel {
    port,
    base_url: format!("http://127.0.0.1:{port}"),
  })
}

/// Stop the local overlay HTTP/WS server.
#[tauri::command]
pub async fn stopOverlayServer(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
  state.overlay_server_service.clone().stop().await
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

  // In dev mode, load from Angular dev server for live reload support
  // In production, load from overlay HTTP server
  let overlay_url = if let Some(dev_url) = app.config().build.dev_url.as_ref() {
    // Dev mode: use the same origin as the dev server
    // e.g., "http://localhost:1450" -> "http://localhost:1450/overlay?widgetId=..."
    let origin = dev_url.to_string().trim_end_matches('/').to_string();
    format!("{}/overlay?widgetId={}", origin, widget_id.trim())
  } else {
    // Production: load from overlay HTTP server
    format!(
      "http://127.0.0.1:{port}/overlay?widgetId={}",
      widget_id.trim()
    )
  };

  let window_label = format!("overlay-{}", widget_id.trim());

  // Check if window already exists
  if let Some(existing) = app.get_webview_window(&window_label) {
    #[cfg(desktop)]
    {
      let _ = existing.set_focus();
    }
    return Ok(());
  }

  // Create new overlay window
  let mut builder = WebviewWindowBuilder::new(
    &app,
    &window_label,
    WebviewUrl::External(
      overlay_url
        .parse()
        .map_err(|e| format!("Invalid overlay URL: {}", e))?,
    ),
  );

  #[cfg(desktop)]
  {
    builder = builder
      .title("UniChat Overlay Preview")
      .inner_size(500.0, 700.0)
      .resizable(true)
      .decorations(!transparent_bg)
      .always_on_top(true)
      .visible(true);
  }

  builder
    .build()
    .map_err(|e: tauri::Error| e.to_string())?;

  Ok(())
}

use lazy_static::lazy_static;
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
#[allow(clippy::too_many_arguments)]
pub async fn emitOverlayConfigChanged(
  app: tauri::AppHandle,
  widget_id: String,
  timestamp: u64,
  filter: String,
  custom_css: String,
  channel_ids: Option<Vec<String>>,
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

/// Initialize overlay config from client-side storage (called on app startup)
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn initOverlayConfigFromStorage(
  widget_id: String,
  filter: String,
  custom_css: String,
  channel_ids: Option<Vec<String>>,
  text_size: u32,
  animation_type: String,
  animation_direction: String,
  max_messages: u32,
  transparent_bg: bool,
) -> Result<(), String> {
  // Only initialize if config doesn't already exist
  let configs = OVERLAY_CONFIGS.read().await;
  if configs.get(&widget_id).is_some() {
    return Ok(()); // Already initialized
  }
  drop(configs);

  // Store initial config
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
    timestamp: 0, // Initial config, no timestamp
  };

  {
    let mut configs = OVERLAY_CONFIGS.write().await;
    configs.insert(widget_id, config);
  }

  Ok(())
}

/// Get overlay configuration for a widget
#[tauri::command]
pub async fn getOverlayConfig(widget_id: String) -> Result<Option<OverlayFullConfigModel>, String> {
  let configs = OVERLAY_CONFIGS.read().await;
  Ok(configs.get(&widget_id).cloned())
}

/// Parameters for getOverlayMessages command
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetOverlayMessagesParams {
  pub widget_id: String,
  pub limit: Option<u32>,
  pub channel_ids: Option<Vec<String>>,
}

/// Get overlay messages for a widget (filtered by channel selection)
#[tauri::command]
pub async fn getOverlayMessages(
  widget_id: String,
  limit: Option<u32>,
  channel_ids: Option<Vec<String>>,
) -> Result<Vec<OverlayMessageModel>, String> {
  let messages = OVERLAY_MESSAGES.read().await;
  let widget_messages = messages.get(&widget_id);

  if widget_messages.is_none() {
    return Ok(Vec::new());
  }

  let mut result: Vec<OverlayMessageModel> = widget_messages
    .ok_or_else(|| "Widget messages not found".to_string())?
    .clone();

  // Apply channel filter if specified
  if let Some(ids) = channel_ids {
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
  let limit_value = limit.unwrap_or(50) as usize;
  if result.len() > limit_value {
    result.truncate(limit_value);
  }

  Ok(result)
}
