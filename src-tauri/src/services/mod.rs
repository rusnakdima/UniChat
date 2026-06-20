//! Services module
//! Provides core application services
pub mod auth;
#[path = "crud_service.rs"]
pub mod crud_service;
pub mod overlay_server;
#[path = "twitch.service.rs"]
pub mod twitch;
#[path = "update.service.rs"]
pub mod update;
