//! Domain Layer - UniChat
//!
//! This module contains the core domain entities and business logic
//! for the UniChat application.

pub mod entities;
pub mod irc;
pub mod overlay;
pub mod repositories;
pub mod services;

#[allow(unused_imports)]
pub use entities::*;
#[allow(unused_imports)]
pub use repositories::*;
#[allow(unused_imports)]
pub use services::*;
