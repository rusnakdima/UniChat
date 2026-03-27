#![allow(non_snake_case)]

pub mod errors;
pub mod helpers;
pub mod models;
pub mod providers;
pub mod repositories;
pub mod routes;
pub mod services;

use std::sync::Arc;
use tauri::Manager;

use crate::routes::auth_provider_route::{
  authAwaitCallback, authComplete, authDisconnect, authStart, authStatus,
};
use crate::routes::icons_route::{twitchFetchChannelIcons, twitchFetchGlobalIcons};
use crate::routes::kick_route::kickFetchChatroomId;
use crate::routes::overlay_route::{
  emitOverlayConfigChanged, getOverlayConfig, getOverlayMessages, getOverlayUrl, openOverlayWindow,
  sendOverlayMessage, startOverlayServer, stopOverlayServer,
};
use crate::routes::provider_route::{
  connectPlatform, deleteMessage, disconnectPlatform, listenPlatformMessages,
  providerCapabilityLookup, replyToMessage,
};
use crate::routes::twitch_badges_route::{twitchFetchChannelBadges, twitchFetchGlobalBadges};
use crate::routes::youtube_route::{
  youtubeDeleteMessage, youtubeFetchChatMessages, youtubeFetchLiveChatId, youtubeGetLiveVideoId,
  youtubeSendMessage,
};
use crate::services::auth::oauth_provider_service::OAuthProviderService;
use crate::services::overlay_server::overlay_server_service::OverlayServerService;

pub struct AppState {
  pub oauthProviderService: Arc<OAuthProviderService>,
  pub overlayServerService: Arc<OverlayServerService>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .setup(|app| {
      let frontend_dist_dir = resolve_frontend_dist_dir();
      app.manage(AppState {
        oauthProviderService: Arc::new(OAuthProviderService::new()),
        overlayServerService: Arc::new(OverlayServerService::new(frontend_dist_dir)),
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      connectPlatform,
      disconnectPlatform,
      listenPlatformMessages,
      replyToMessage,
      deleteMessage,
      providerCapabilityLookup,
      authStart,
      authAwaitCallback,
      authComplete,
      authStatus,
      authDisconnect,
      twitchFetchGlobalBadges,
      twitchFetchChannelBadges,
      twitchFetchGlobalIcons,
      twitchFetchChannelIcons,
      startOverlayServer,
      stopOverlayServer,
      getOverlayUrl,
      openOverlayWindow,
      emitOverlayConfigChanged,
      getOverlayConfig,
      sendOverlayMessage,
      getOverlayMessages,
      youtubeFetchLiveChatId,
      youtubeSendMessage,
      youtubeDeleteMessage,
      youtubeGetLiveVideoId,
      youtubeFetchChatMessages,
      kickFetchChatroomId
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
