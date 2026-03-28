//! Authentication services module
//! Provides OAuth authentication flow management

#[path = "oauth_state.service.rs"]
pub mod oauth_state_service;

#[path = "oauth_loopback.service.rs"]
pub mod oauth_loopback_service;

#[path = "token_vault.service.rs"]
pub mod token_vault_service;

#[path = "oauth_provider.service.rs"]
pub mod oauth_provider_service;

#[path = "oauth_helpers.rs"]
pub mod oauth_helpers;

#[path = "oauth_token_exchange.rs"]
pub mod oauth_token_exchange;

#[path = "oauth_identity_fetch.rs"]
pub mod oauth_identity_fetch;
