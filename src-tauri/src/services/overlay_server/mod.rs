//! Overlay server module
//! Provides HTTP/WebSocket server for OBS browser source overlays

#[path = "overlay.router.rs"]
pub mod overlay_router;

#[path = "overlay_server_service.rs"]
pub mod overlay_server_service;

#[path = "overlay.subscriber_manager.rs"]
pub mod overlay_subscriber_manager;

#[path = "overlay.ws_handlers.rs"]
pub mod overlay_ws_handlers;
