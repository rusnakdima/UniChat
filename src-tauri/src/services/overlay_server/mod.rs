//! Overlay server module
//! Provides HTTP/WebSocket server for OBS browser source overlays

#[path = "overlay-helpers.service.rs"]
pub mod overlay_helpers;

#[path = "overlay-router.service.rs"]
pub mod overlay_router;

#[path = "overlay-server-service.service.rs"]
pub mod overlay_server_service;

#[path = "overlay-subscriber-manager.service.rs"]
pub mod overlay_subscriber_manager;

#[path = "overlay-ws-handlers.service.rs"]
pub mod overlay_ws_handlers;
