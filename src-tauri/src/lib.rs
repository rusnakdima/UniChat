pub mod constants;
pub mod helpers;
pub mod models;
pub mod routes;
pub mod services;
pub mod utils;

use std::sync::Arc;
use tauri::Manager;

use crate::helpers::config_helper::{AppConfig, SharedConfig};
use crate::routes::auth_provider_route::{
  authAwaitCallback, authComplete, authDisconnect, authRefresh, authStart, authStatus, authValidate,
};
use crate::routes::icons_route::{twitchFetchChannelIcons, twitchFetchGlobalIcons};
use crate::routes::kick_route::{
  kickDeleteChatMessage, kickFetchChannelEmotes, kickFetchChannelInfo, kickFetchChatroomId,
  kickFetchRecentMessages, kickFetchUserInfo, kickSendChatMessage,
};
use crate::routes::overlay_route::{
  emitOverlayConfigChanged, getOverlayConfig, getOverlayMessages, initOverlayConfigFromStorage,
  openOverlayWindow, startOverlayServer, stopOverlayServer,
};
use crate::routes::twitch_route::twitchDeleteMessage;
use crate::routes::youtube_route::{
  youtubeDeleteMessage, youtubeFetchChannelInfo, youtubeFetchChannelInfoByApiKey,
  youtubeFetchChatMessages, youtubeFetchLiveChatId, youtubeFetchLiveVideoId,
  youtubeFetchLiveVideoIdByApiKey, youtubeSendMessage,
};
use crate::services::auth::oauth_provider_service::OAuthProviderService;
use crate::services::overlay_server::overlay_server_service::OverlayServerService;
use tauri::Emitter;
use tauri_plugin_deep_link::DeepLinkExt;

pub struct AppState {
  pub config: SharedConfig,
  pub oauth_provider_service: Arc<OAuthProviderService>,
  pub overlay_server_service: Arc<OverlayServerService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_mcp_bridge::init())
    .setup(|app| {
      let config = Arc::new(AppConfig::new());

      let frontend_dist_dir = resolve_frontend_dist_dir(app);

      let overlay_server = Arc::new(OverlayServerService::new(frontend_dist_dir));

      let overlay_server_clone = overlay_server.clone();
      tauri::async_runtime::spawn(async move {
        let _ = overlay_server_clone.start(1450).await;
      });

      let oauth_service = Arc::new(OAuthProviderService::new_with_config(config.clone()));
      let oauth_service_clone = oauth_service.clone();

      app.manage(AppState {
        config: config.clone(),
        oauth_provider_service: oauth_service,
        overlay_server_service: overlay_server,
      });

      // Handle deep-link events (for OAuth callbacks in Flatpak)
      let app_handle = app.handle().clone();
      app.deep_link().on_open_url(move |event| {
        let urls = event.urls();
        for url in urls {
          if url.scheme() == "unichat" && url.path().starts_with("/oauth/callback") {
            let url_string = url.to_string();
            let oauth_service = oauth_service_clone.clone();
            let app_handle = app_handle.clone();

            tauri::async_runtime::spawn(async move {
              let platforms = vec![
                crate::models::platform_type_model::PlatformTypeModel::Twitch,
                crate::models::platform_type_model::PlatformTypeModel::Kick,
                crate::models::platform_type_model::PlatformTypeModel::Youtube,
              ];

              for platform in platforms {
                if let Ok(account) = oauth_service
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
      authStart,
      authAwaitCallback,
      authComplete,
      authStatus,
      authValidate,
      authRefresh,
      authDisconnect,
      twitchFetchGlobalIcons,
      twitchFetchChannelIcons,
      twitchDeleteMessage,
      startOverlayServer,
      stopOverlayServer,
      openOverlayWindow,
      emitOverlayConfigChanged,
      initOverlayConfigFromStorage,
      getOverlayConfig,
      getOverlayMessages,
      youtubeFetchChatMessages,
      youtubeFetchLiveVideoIdByApiKey,
      youtubeFetchLiveVideoId,
      youtubeFetchLiveChatId,
      youtubeSendMessage,
      youtubeDeleteMessage,
      kickFetchChatroomId,
      kickFetchRecentMessages,
      kickFetchUserInfo,
      kickFetchChannelEmotes,
      kickFetchChannelInfo,
      kickSendChatMessage,
      kickDeleteChatMessage,
      youtubeFetchChannelInfoByApiKey,
      youtubeFetchChannelInfo,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[allow(unused_variables)]
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
