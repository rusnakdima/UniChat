//! Services module
//! Provides core application services

#[path = "provider_capability.service.rs"]
pub mod provider_capability_service;

#[path = "message_router_service.rs"]
pub mod message_router_service;

#[path = "message_filter_service.rs"]
pub mod message_filter_service;

#[path = "message_batching_service.rs"]
pub mod message_batching_service;

#[path = "memory_optimization_service.rs"]
pub mod memory_optimization_service;

#[path = "performance_monitor_service.rs"]
pub mod performance_monitor_service;

pub mod auth;

pub mod overlay_server;
