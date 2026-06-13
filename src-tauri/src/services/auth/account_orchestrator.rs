//! Account Service Orchestrator
//! Holds AccountService struct definition and delegates to other modules

use reqwest::Client;

use crate::helpers::config_helper::SharedConfig;
use crate::helpers::http_client::shared_client;
use crate::services::auth::oauth::OAuthService;
use crate::services::auth::token_vault_service::TokenVaultService;

pub struct AccountService {
  pub http: Client,
  pub oauth_service: OAuthService,
  pub token_vault_service: TokenVaultService,
  pub config: SharedConfig,
}

impl Default for AccountService {
  fn default() -> Self {
    Self::new()
  }
}

impl AccountService {
  pub fn new() -> Self {
    Self {
      http: shared_client(),
      oauth_service: OAuthService::new(),
      token_vault_service: TokenVaultService::new(),
      config: SharedConfig::default(),
    }
  }

  pub fn new_with_config(config: SharedConfig) -> Self {
    Self {
      http: shared_client(),
      oauth_service: OAuthService::new(),
      token_vault_service: TokenVaultService::new(),
      config,
    }
  }
}
