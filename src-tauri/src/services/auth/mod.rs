//! Authentication services module
//! Provides OAuth authentication flow management

#[path = "oauth_state.service.rs"]
pub mod oauth_state_service;

#[path = "oauth.rs"]
pub mod oauth;

#[path = "oauth.internal.rs"]
pub(crate) mod oauth_internal;

#[path = "token_vault.service.rs"]
pub mod token_vault_service;

#[path = "account.rs"]
pub mod account;
