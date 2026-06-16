pub mod constants;
pub mod entities;
pub mod errors;
pub mod helpers;
pub mod models;
pub mod providers;
pub mod routes;
pub mod services;
pub mod utils;

use std::sync::Arc;
use tauri::Manager;

use crate::constants::OVERLAY_SERVER_PORT;
use crate::entities::chat_account_entity::ChatAccountEntity;
use crate::entities::chat_channel_entity::ChatChannelEntity;
use crate::entities::chat_message_entity::ChatMessageEntity;
use crate::entities::custom_emote_entity::CustomEmoteEntity;
use crate::entities::dashboard_preferences_entity::DashboardPreferencesEntity;
use crate::helpers::config_helper::{AppConfig, SharedConfig};
use crate::providers::data_provider::DataProvider;
use crate::routes::auth_provider_route::{
  auth_await_callback, auth_complete, auth_disconnect, auth_refresh, auth_start, auth_status,
  auth_validate,
};
use crate::routes::chat_account_command::{
  create_chat_account, delete_chat_account, get_chat_account,
  get_chat_account_by_platform_and_user, get_chat_accounts, get_chat_accounts_by_platform,
  patch_chat_account, update_chat_account,
};
use crate::routes::chat_channel_command::{
  create_chat_channel, delete_chat_channel, get_chat_channel, get_chat_channel_by_platform_and_id,
  get_chat_channels, patch_chat_channel, update_chat_channel,
};
use crate::routes::chat_message_command::{
  create_chat_message, delete_chat_message, delete_chat_messages_by_channel, get_chat_message,
  get_chat_messages, get_chat_messages_by_channel, patch_chat_message, update_chat_message,
};
use crate::routes::chat_route::{
  kick_delete_chat_message, kick_fetch_channel_emotes, kick_fetch_channel_info,
  kick_fetch_chatroom_id, kick_fetch_recent_messages, kick_fetch_user_info, kick_send_chat_message,
  twitch_delete_message, twitch_fetch_channel_emotes, youtube_fetch_channel_info_by_api_key,
  youtube_fetch_chat_messages, youtube_fetch_live_video_id_by_api_key,
};
use crate::routes::custom_emote_command::{
  create_custom_emote, delete_custom_emote, get_custom_emote, get_custom_emotes,
  get_custom_emotes_by_platform, patch_custom_emote, update_custom_emote,
};
use crate::routes::dashboard_preferences_command::{
  create_dashboard_preferences, delete_dashboard_preferences, get_dashboard_preferences,
  get_dashboard_preferences_list, get_or_create_dashboard_preferences, patch_dashboard_preferences,
  update_dashboard_preferences,
};
use crate::routes::icons_route::{twitch_fetch_channel_icons, twitch_fetch_global_icons};
use crate::routes::overlay_route::{
  emit_overlay_config_changed, get_overlay_config, get_overlay_messages,
  init_overlay_config_from_storage, open_overlay_window, start_overlay_server, stop_overlay_server,
};
use crate::routes::update_route::{
  check_for_update, download_update, get_current_version, install_update,
};
use crate::services::auth::AccountService;
use crate::services::overlay_server::overlay_server_service::OverlayServerService;
use nosql_orm::providers::JsonProvider;
use nosql_orm::relations::register_relations_for_entity;
use tauri::Emitter;
use tauri_plugin_deep_link::DeepLinkExt;

#[macro_export]
macro_rules! log_info { ($($arg:tt)*) => { log::info!($($arg)*) }; }
#[macro_export]
macro_rules! log_error { ($($arg:tt)*) => { log::error!($($arg)*) }; }
#[macro_export]
macro_rules! log_debug { ($($arg:tt)*) => { log::debug!($($arg)*) }; }
#[macro_export]
macro_rules! log_warn { ($($arg:tt)*) => { log::warn!($($arg)*) }; }

pub struct AppState {
  pub config: SharedConfig,
  pub account_service: Arc<AccountService>,
  pub overlay_server_service: Arc<OverlayServerService>,
  pub data: DataState,
}

pub struct DataState {
  pub json_provider: DataProvider,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  register_relations_for_entity::<ChatMessageEntity>();
  register_relations_for_entity::<ChatChannelEntity>();
  register_relations_for_entity::<ChatAccountEntity>();
  register_relations_for_entity::<DashboardPreferencesEntity>();
  register_relations_for_entity::<CustomEmoteEntity>();

  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_mcp_bridge::init())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      let config = Arc::new(AppConfig::new());
      config
        .validate()
        .map_err(|e| log_error!("Config validation failed: {}", e))
        .ok();

      let frontend_dist_dir = resolve_frontend_dist_dir(app);
      let overlay_server = Arc::new(OverlayServerService::new(frontend_dist_dir));

      let overlay_server_clone = overlay_server.clone();
      tauri::async_runtime::spawn(async move {
        let _ = overlay_server_clone.start(OVERLAY_SERVER_PORT).await;
      });

      let account_service = Arc::new(AccountService::new_with_config(config.clone()));
      let account_service_clone = account_service.clone();

      let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory");
      let json_db_path = app_data_dir.join("unichat_db");
      std::fs::create_dir_all(&json_db_path).ok();

      let json_provider = tauri::async_runtime::block_on(JsonProvider::new(&json_db_path))
        .expect("Failed to create JSON provider");

      let data_provider = DataProvider::Json(Arc::new(json_provider));

      app.manage(AppState {
        config: config.clone(),
        account_service,
        overlay_server_service: overlay_server,
        data: DataState {
          json_provider: data_provider,
        },
      });

      let app_handle = app.handle().clone();
      app.deep_link().on_open_url(move |event| {
        let urls = event.urls();
        for url in urls {
          if url.scheme() == "unichat" && url.path().starts_with("/oauth/callback") {
            let url_string = url.to_string();
            let account_service = account_service_clone.clone();
            let app_handle = app_handle.clone();

            tauri::async_runtime::spawn(async move {
              let platforms = vec![
                crate::models::platform_type_model::PlatformTypeModel::Twitch,
                crate::models::platform_type_model::PlatformTypeModel::Kick,
                crate::models::platform_type_model::PlatformTypeModel::Youtube,
              ];

              for platform in platforms {
                if let Ok(account) = account_service
                  .complete_auth(platform.clone(), url_string.clone())
                  .await
                {
                  let _ = app_handle.emit("oauth-complete", &account);
                  return;
                }
              }

              let error_msg = "OAuth callback failed for all platforms";
              let _ = app_handle.emit("oauth-error", error_msg);
            });
          }
        }
      });

      Ok(())
    })
    .on_window_event(|_window, event| match event {
      tauri::WindowEvent::CloseRequested { .. } => {}
      tauri::WindowEvent::Focused(focused) => if *focused {},
      _ => {}
    })
    .invoke_handler(tauri::generate_handler![
      auth_start,
      auth_await_callback,
      auth_complete,
      auth_status,
      auth_validate,
      auth_refresh,
      auth_disconnect,
      twitch_fetch_global_icons,
      twitch_fetch_channel_icons,
      twitch_delete_message,
      twitch_fetch_channel_emotes,
      start_overlay_server,
      stop_overlay_server,
      open_overlay_window,
      emit_overlay_config_changed,
      init_overlay_config_from_storage,
      get_overlay_config,
      get_overlay_messages,
      youtube_fetch_chat_messages,
      youtube_fetch_live_video_id_by_api_key,
      kick_fetch_chatroom_id,
      kick_fetch_recent_messages,
      kick_fetch_user_info,
      kick_fetch_channel_emotes,
      kick_fetch_channel_info,
      kick_send_chat_message,
      kick_delete_chat_message,
      youtube_fetch_channel_info_by_api_key,
      check_for_update,
      download_update,
      install_update,
      get_current_version,
      get_chat_message,
      get_chat_messages,
      create_chat_message,
      update_chat_message,
      patch_chat_message,
      delete_chat_message,
      get_chat_messages_by_channel,
      delete_chat_messages_by_channel,
      get_chat_channel,
      get_chat_channels,
      create_chat_channel,
      update_chat_channel,
      patch_chat_channel,
      delete_chat_channel,
      get_chat_channel_by_platform_and_id,
      get_chat_account,
      get_chat_accounts,
      create_chat_account,
      update_chat_account,
      patch_chat_account,
      delete_chat_account,
      get_chat_account_by_platform_and_user,
      get_chat_accounts_by_platform,
      get_dashboard_preferences,
      get_dashboard_preferences_list,
      create_dashboard_preferences,
      update_dashboard_preferences,
      patch_dashboard_preferences,
      delete_dashboard_preferences,
      get_or_create_dashboard_preferences,
      get_custom_emote,
      get_custom_emotes,
      create_custom_emote,
      update_custom_emote,
      patch_custom_emote,
      delete_custom_emote,
      get_custom_emotes_by_platform,
    ]);

  if let Err(e) = builder.run(tauri::generate_context!()) {
    log_error!("Failed to run tauri application: {}", e);
    std::process::exit(1);
  }
}

#[allow(unused)]
fn resolve_frontend_dist_dir(app: &tauri::App) -> std::path::PathBuf {
  #[cfg(debug_assertions)]
  {
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let candidates = [
      "dist/unichat/browser",
      "../dist/unichat/browser",
      "src-tauri/../dist/unichat/browser",
    ];
    for rel in candidates {
      let p = cwd.join(rel);
      if p.exists() {
        return p;
      }
    }
    cwd.join("dist/unichat/browser")
  }

  #[cfg(not(debug_assertions))]
  {
    if let Ok(resource_dir) = app.path().resource_dir() {
      let frontend_dist = resource_dir.join("dist").join("unichat").join("browser");
      if frontend_dist.exists() && frontend_dist.join("index.html").exists() {
        return frontend_dist;
      }
    }

    if let Ok(exe_path) = std::env::current_exe() {
      if let Some(exe_dir) = exe_path.parent() {
        let fallback = exe_dir.join("dist").join("unichat").join("browser");
        if fallback.exists() && fallback.join("index.html").exists() {
          return fallback;
        }

        if let Some(parent) = exe_dir.parent() {
          let alt_fallback = parent.join("dist").join("unichat").join("browser");
          if alt_fallback.exists() && alt_fallback.join("index.html").exists() {
            return alt_fallback;
          }
        }
      }
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    cwd.join("dist").join("unichat").join("browser")
  }
}
