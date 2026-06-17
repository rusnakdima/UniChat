//! Authentication services module
//! Provides OAuth authentication flow management

#[path = "auth-state.service.rs"]
pub mod auth_state;

#[path = "auth-internal.service.rs"]
pub(crate) mod auth_internal;

#[path = "oauth_loopback.service.rs"]
pub mod oauth_loopback;

#[path = "oauth.service.rs"]
pub mod oauth_service;

#[path = "token_vault.service.rs"]
pub mod token_vault;

#[path = "account.service.rs"]
pub mod account_service;

pub use account_service::AccountService;
pub use oauth_loopback::OAuthLoopbackService;
pub use oauth_service::OAuthService;
pub use token_vault::TokenVaultService;
