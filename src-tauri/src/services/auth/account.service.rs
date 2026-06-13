//! Account Service
//! Handles account management, authentication status validation, and OAuth orchestration

use log;
use reqwest::Client;

use crate::helpers::config_helper::SharedConfig;
use crate::helpers::http_client::shared_client;
use crate::helpers::oauth_config_helper::get_oauth_provider_config;
use crate::models::auth_account_model::{AuthAccountModel, AuthStatusModel};
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::platform_type_model::PlatformTypeModel;
use crate::services::auth::oauth_internal::refresh_access_token;
use crate::services::auth::oauth_service::OAuthService;
use crate::services::auth::token_vault_service::TokenVaultService;

pub struct AccountService {
  http: Client,
  oauth_service: OAuthService,
  token_vault_service: TokenVaultService,
  config: SharedConfig,
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

  pub fn start_auth(&self, platform: PlatformTypeModel) -> Result<String, String> {
    self.oauth_service.start_auth(platform)
  }

  pub async fn await_loopback_and_complete(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<AuthAccountModel, String> {
    log::debug!("Waiting for OAuth callback for {:?}", platform);
    let callback_url = self.oauth_service.wait_for_callback(platform.clone())?;
    self.complete_auth(platform, callback_url).await
  }

  pub async fn complete_auth(
    &self,
    platform: PlatformTypeModel,
    callback_url: String,
  ) -> Result<AuthAccountModel, String> {
    let account = self
      .oauth_service
      .complete_auth(platform.clone(), callback_url, &self.config)
      .await?;
    self.upsert_account(&account)?;
    self.token_vault_service.save_token(
      &account,
      &OAuthTokenModel {
        access_token: account.access_token.clone().unwrap_or_default(),
        refresh_token: account.refresh_token.clone(),
        expires_in_seconds: None,
      },
    )?;
    Ok(account)
  }

  pub fn list_accounts(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    self.token_vault_service.read_accounts(&platform)
  }

  pub fn upsert_account(&self, account: &AuthAccountModel) -> Result<(), String> {
    self.token_vault_service.upsert_account(account)
  }

  pub fn remove_account(
    &self,
    platform: &PlatformTypeModel,
    account_id: &str,
  ) -> Result<(), String> {
    self
      .token_vault_service
      .remove_account(platform, account_id)
  }

  pub fn get_auth_status(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    self.token_vault_service.read_accounts(&platform)
  }

  pub async fn validate_auth_status(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    log::debug!("Validating auth status for {:?}", platform);
    let mut accounts = self.get_auth_status(platform.clone())?;
    let config = get_oauth_provider_config(&platform, &self.config)?;
    let now = chrono::Utc::now();

    for account in &mut accounts {
      if let Some(expires_at_str) = &account.token_expires_at {
        if let Ok(expires_at) = chrono::DateTime::parse_from_rfc3339(expires_at_str) {
          if now >= expires_at {
            if account.refresh_token.is_some() {
              log::debug!("Token expired for account {} on {:?}", account.id, platform);
              account.auth_status = AuthStatusModel::TokenExpired;
            } else {
              log::debug!(
                "Token expired without refresh for account {} on {:?}",
                account.id,
                platform
              );
              account.auth_status = AuthStatusModel::TokenExpired;
            }
          }
        }
      }

      if account.auth_status == AuthStatusModel::Authorized {
        match self
          .validate_token_with_api(&platform, &account.access_token, &config)
          .await
        {
          Ok(true) => {
            account.auth_status = AuthStatusModel::Authorized;
          }
          Ok(false) => {
            log::warn!("Token revoked for account {} on {:?}", account.id, platform);
            account.auth_status = AuthStatusModel::Revoked;
          }
          Err(_) => {}
        }
      }
    }

    Ok(accounts)
  }

  async fn validate_token_with_api(
    &self,
    platform: &PlatformTypeModel,
    access_token: &Option<String>,
    config: &crate::helpers::oauth_config_helper::OAuthProviderConfig,
  ) -> Result<bool, String> {
    let token = access_token
      .as_ref()
      .ok_or_else(|| "No access token available".to_string())?;

    let mut request = self.http.get(&config.userinfo_url).bearer_auth(token);

    if matches!(platform, PlatformTypeModel::Twitch) {
      request = request.header("Client-Id", &config.client_id);
    }

    let response = request
      .send()
      .await
      .map_err(|e| format!("Validation request failed: {e}"))?;

    let status = response.status();

    if status.is_success() {
      return Ok(true);
    }

    if status == 401 || status == 403 {
      return Ok(false);
    }

    Err(format!("API error {status}, not marking as revoked"))
  }

  pub async fn refresh_token(
    &self,
    platform: &PlatformTypeModel,
    account_id: &str,
  ) -> Result<AuthAccountModel, String> {
    log::info!(
      "Refreshing token for account {} on {:?}",
      account_id,
      platform
    );
    let saved_token = self
      .token_vault_service
      .read_token(platform, account_id)?
      .ok_or_else(|| "No saved token found".to_string())?;

    let refresh_token = saved_token
      .refresh_token
      .ok_or_else(|| "No refresh token available. Please re-authenticate.".to_string())?;

    let config = get_oauth_provider_config(platform, &self.config)?;

    log::debug!("Performing token refresh for account {}", account_id);
    let new_token = refresh_access_token(&self.http, platform, &refresh_token, &config).await?;

    let accounts = self.token_vault_service.read_accounts(platform)?;
    let mut account = accounts
      .into_iter()
      .find(|acc| acc.id == account_id)
      .ok_or_else(|| "Account not found".to_string())?;

    let expires_at = new_token
      .expires_in_seconds
      .map(|seconds| (chrono::Utc::now() + chrono::Duration::seconds(seconds)).to_rfc3339());
    account.access_token = Some(new_token.access_token.clone());
    account.refresh_token = new_token.refresh_token.clone();
    account.token_expires_at = expires_at;
    account.auth_status = AuthStatusModel::Authorized;

    self.token_vault_service.upsert_account(&account)?;
    self.token_vault_service.save_token(&account, &new_token)?;

    log::info!(
      "Token refreshed successfully for account {} on {:?}",
      account_id,
      platform
    );
    Ok(account)
  }

  pub async fn disconnect(
    &self,
    platform: PlatformTypeModel,
    account_id: String,
  ) -> Result<(), String> {
    log::info!("Disconnecting account {} on {:?}", account_id, platform);
    let token = self
      .token_vault_service
      .read_token(&platform, &account_id)?;
    if let Some(saved_token) = token {
      let config = get_oauth_provider_config(&platform, &SharedConfig::default())?;
      if let Some(revoke_url) = config.revoke_url {
        log::debug!(
          "Revoking token for account {} on {:?}",
          account_id,
          platform
        );
        let mut form: Vec<(&str, &str)> = vec![
          ("client_id", &config.client_id),
          ("token", &saved_token.access_token),
        ];
        if let Some(ref secret) = config.client_secret {
          form.push(("client_secret", secret));
        }
        match self.http.post(revoke_url).form(&form).send().await {
          Ok(response) => {
            if !response.status().is_success() {
              log::warn!("Token revoke request failed for account {}", account_id);
            }
          }
          Err(e) => {
            log::warn!(
              "Token revoke request error for account {}: {}",
              account_id,
              e
            );
          }
        }
      }
    }

    self
      .token_vault_service
      .delete_token(&platform, &account_id)?;
    self
      .token_vault_service
      .remove_account(&platform, &account_id)?;
    log::info!("Account {} disconnected successfully", account_id);
    Ok(())
  }

  pub fn validate_token_for_role(&self, token: &str, role: &str) -> Result<(), String> {
    self
      .token_vault_service
      .validate_token_for_role(token, role)
  }
}
