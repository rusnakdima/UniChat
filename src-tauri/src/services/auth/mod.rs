//! Authentication services module
//! Provides OAuth authentication flow management

#[path = "auth-state.service.rs"]
pub mod auth_state;

#[path = "auth-internal.service.rs"]
pub(crate) mod auth_internal;

#[path = "account.service.rs"]
pub mod account_service;

pub use account_service::{AccountService, OAuthService, TokenVaultService};
