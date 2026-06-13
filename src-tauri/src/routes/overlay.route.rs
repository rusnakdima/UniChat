use crate::constants::MAX_WIDGET_IDS;
use crate::models::overlay_message_model::OverlayMessageModel;
use crate::services::overlay_server::overlay_helpers::filter_and_sort_messages;
use log;
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
  log::info!("Starting overlay server on port {}", port);
  state
    .overlay_server_service
    .clone()
    .start(port)
    .await
    .map_err(|e| {
      log::error!("Failed to start overlay server: {}", e);
      e.to_string()
    })?;
  log::debug!("Overlay server started successfully");
  Ok(OverlayServerStartResultModel {
    port,
    base_url: format!("http://127.0.0.1:{port}"),
  })
}

/// Stop the local overlay HTTP/WS server.
#[tauri::command]
pub async fn stopOverlayServer(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
  log::info!("Stopping overlay server");
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

  log::info!("Opening overlay window for widget: {}", widget_id);

  if widget_id.trim().is_empty() {
    log::error!("Widget ID is required");
    return Err("widgetId required".to_string());
  }

  #[cfg(debug_assertions)]
  let overlay_url = if let Some(dev_url) = app.config().build.dev_url.as_ref() {
    let origin = dev_url.to_string().trim_end_matches('/').to_string();
    format!("{}/overlay?widgetId={}", origin, widget_id.trim())
  } else {
    format!(
      "http://127.0.0.1:{port}/overlay?widgetId={}",
      widget_id.trim()
    )
  };
  #[cfg(not(debug_assertions))]
  let overlay_url = {
    format!(
      "http://127.0.0.1:{port}/overlay?widgetId={}",
      widget_id.trim()
    )
  };

  let window_label = format!("overlay-{}", widget_id.trim());

  if let Some(existing) = app.get_webview_window(&window_label) {
    log::debug!(
      "Overlay window already exists for widget: {}, focusing",
      widget_id
    );
    #[cfg(desktop)]
    {
      let _ = existing.set_focus();
    }
    return Ok(());
  }

  let mut builder = WebviewWindowBuilder::new(
    &app,
    &window_label,
    WebviewUrl::External(overlay_url.parse().map_err(|e| {
      log::error!("Invalid overlay URL: {}", e);
      format!("Invalid overlay URL: {}", e)
    })?),
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

  builder.build().map_err(|e: tauri::Error| {
    log::error!("Failed to build overlay window: {}", e);
    e.to_string()
  })?;

  log::info!(
    "Overlay window created successfully for widget: {}",
    widget_id
  );
  Ok(())
}

async fn enforce_max_overlay_ids(
  configs: &mut std::collections::HashMap<String, OverlayFullConfigModel>,
  messages: &mut std::collections::HashMap<String, Vec<OverlayMessageModel>>,
) {
  if configs.len() >= MAX_WIDGET_IDS {
    if let Some(oldest_id) = configs.keys().next().cloned() {
      configs.remove(&oldest_id);
      messages.remove(&oldest_id);
    }
  }
}

/// Emit overlay configuration changed event to all windows and store in backend.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn emitOverlayConfigChanged(
  app: tauri::AppHandle,
  state: tauri::State<'_, crate::AppState>,
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
    let mut configs = state.overlay_server_service.overlay_configs.write().await;
    let mut messages = state.overlay_server_service.overlay_messages.write().await;
    enforce_max_overlay_ids(&mut configs, &mut messages).await;
    configs.insert(widget_id.clone(), config);
  }

  app
    .emit(
      "overlay-config-changed",
      OverlayConfigChangedModel {
        widget_id,
        timestamp,
      },
    )
    .map_err(|e| {
      log::error!("Failed to emit overlay-config-changed event: {}", e);
      e.to_string()
    })?;
  log::debug!("Overlay config changed event emitted");
  Ok(())
}

/// Initialize overlay config from client-side storage (called on app startup)
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn initOverlayConfigFromStorage(
  state: tauri::State<'_, crate::AppState>,
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
  let configs = state.overlay_server_service.overlay_configs.read().await;
  if configs.get(&widget_id).is_some() {
    return Ok(());
  }
  drop(configs);

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
    timestamp: 0,
  };

  {
    let mut configs = state.overlay_server_service.overlay_configs.write().await;
    let mut messages = state.overlay_server_service.overlay_messages.write().await;
    enforce_max_overlay_ids(&mut configs, &mut messages).await;
    configs.insert(widget_id, config);
  }

  Ok(())
}

/// Get overlay configuration for a widget
#[tauri::command]
pub async fn getOverlayConfig(
  state: tauri::State<'_, crate::AppState>,
  widget_id: String,
) -> Result<Option<OverlayFullConfigModel>, String> {
  log::debug!("Getting overlay config for widget: {}", widget_id);
  let configs = state.overlay_server_service.overlay_configs.read().await;
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
  state: tauri::State<'_, crate::AppState>,
  widget_id: String,
  limit: Option<u32>,
  channel_ids: Option<Vec<String>>,
) -> Result<Vec<OverlayMessageModel>, String> {
  log::debug!("Getting overlay messages for widget: {}", widget_id);
  let messages = state.overlay_server_service.overlay_messages.read().await;
  let Some(widget_messages) = messages.get(&widget_id) else {
    log::debug!("No messages found for widget: {}", widget_id);
    return Ok(Vec::new());
  };

  let result = filter_and_sort_messages(widget_messages, channel_ids.as_ref(), limit);

  Ok(result)
}
