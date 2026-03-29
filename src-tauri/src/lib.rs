pub mod constants;
pub mod helpers;
pub mod models;
pub mod routes;
pub mod services;

use std::sync::Arc;
use tauri::Manager;

use crate::routes::auth_provider_route::{
  authAwaitCallback, authComplete, authDisconnect, authStart, authStatus,
};
use crate::routes::icons_route::{twitchFetchChannelIcons, twitchFetchGlobalIcons};
use crate::routes::kick_route::{kickFetchChatroomId, kickFetchRecentMessages, kickFetchUserInfo};
use crate::routes::overlay_route::{
  emitOverlayConfigChanged, getOverlayConfig, initOverlayConfigFromStorage, openOverlayWindow,
  startOverlayServer, stopOverlayServer,
};
use crate::routes::youtube_route::youtubeFetchChatMessages;
use crate::services::auth::oauth_provider_service::OAuthProviderService;
use crate::services::overlay_server::overlay_server_service::OverlayServerService;

pub struct AppState {
  pub oauth_provider_service: Arc<OAuthProviderService>,
  pub overlay_server_service: Arc<OverlayServerService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .setup(|app| {
      let frontend_dist_dir = resolve_frontend_dist_dir();

      // Initialize overlay server
      let overlay_server = Arc::new(OverlayServerService::new(frontend_dist_dir));

      app.manage(AppState {
        oauth_provider_service: Arc::new(OAuthProviderService::new()),
        overlay_server_service: overlay_server,
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
      authDisconnect,
      twitchFetchGlobalIcons,
      twitchFetchChannelIcons,
      startOverlayServer,
      stopOverlayServer,
      openOverlayWindow,
      emitOverlayConfigChanged,
      initOverlayConfigFromStorage,
      getOverlayConfig,
      youtubeFetchChatMessages,
      kickFetchChatroomId,
      kickFetchRecentMessages,
      kickFetchUserInfo,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn resolve_frontend_dist_dir() -> std::path::PathBuf {
  // P0 fallback: allow dev-mode execution even when Tauri resource resolution differs.
  // When built for release, the overlay server will still serve from this folder.
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
