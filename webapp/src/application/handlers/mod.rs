//! Application Handlers - UniChat KAS Handlers
//!
//! KAS (Kernel Algorithm System) handlers for UniChat operations including
//! chat messages, channels, accounts, emotes, platform integrations
//! (Twitch IRC, Kick, YouTube), overlay system, storage, auth, and updates.

pub mod handlers;

#[allow(unused_imports)]
pub use handlers::*;
