// Allow non_snake_case for Tauri IPC commands (camelCase is the convention for JavaScript interop)
#![allow(non_snake_case)]

#[path = "auth_provider.route.rs"]
pub mod auth_provider_route;

#[path = "overlay.route.rs"]
pub mod overlay_route;

#[path = "icons.route.rs"]
pub mod icons_route;

#[path = "youtube.route.rs"]
pub mod youtube_route;

#[path = "kick.route.rs"]
pub mod kick_route;

#[path = "twitch.route.rs"]
pub mod twitch_route;
