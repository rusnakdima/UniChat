#![allow(non_snake_case)]

pub mod errors;
pub mod helpers;
pub mod models;
pub mod providers;
pub mod repositories;
pub mod routes;
pub mod services;

use crate::routes::provider_route::{
  connectPlatform, deleteMessage, disconnectPlatform, listenPlatformMessages,
  providerCapabilityLookup, replyToMessage,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      connectPlatform,
      disconnectPlatform,
      listenPlatformMessages,
      replyToMessage,
      deleteMessage,
      providerCapabilityLookup
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
