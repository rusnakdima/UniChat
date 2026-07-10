//! Services module
//! Provides core application services
pub mod auth;
pub mod overlay_server;
#[path = "twitch.service.rs"]
pub mod twitch;
#[path = "twitch_irc.service.rs"]
pub mod twitch_irc;
#[path = "update.service.rs"]
pub mod update;
