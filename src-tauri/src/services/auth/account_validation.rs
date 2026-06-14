//! Account Validation
//! Handles token expiration checking and API validation

use crate::{log_debug, log_warn};

use crate::helpers::oauth_config_helper::{get_oauth_provider_config, OAuthProviderConfig};
use crate::models::auth_account_model::{AuthAccountModel, AuthStatusModel};
use crate::models::platform_type_model::PlatformTypeModel;

use super::AccountService;

impl AccountService {
  pub async fn validate_auth_status(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    log_debug!("Validating auth status for {:?}", platform);
    let mut accounts = self.get_auth_status(platform.clone())?;
    let config = get_oauth_provider_config(&platform, &self.config)?;
    let now = chrono::Utc::now();

    for account in &mut accounts {
      Self::check_token_expiration(account, &now, &platform);
      if let Some(is_valid) = self
        .update_account_auth_status(account, &platform, &config)
        .await
      {
        if !is_valid {
          log_warn!("Token revoked for account {} on {:?}", account.id, platform);
        }
      }
    }

    Ok(accounts)
  }

  fn check_token_expiration(
    account: &mut AuthAccountModel,
    now: &chrono::DateTime<chrono::Utc>,
    platform: &PlatformTypeModel,
  ) {
    let Some(expires_at_str) = &account.token_expires_at else {
      return;
    };
    let Ok(expires_at) = chrono::DateTime::parse_from_rfc3339(expires_at_str) else {
      return;
    };
    if *now >= expires_at {
      if account.refresh_token.is_some() {
        log_debug!("Token expired for account {} on {:?}", account.id, platform);
      } else {
        log_debug!(
          "Token expired without refresh for account {} on {:?}",
          account.id,
          platform
        );
      }
      account.auth_status = AuthStatusModel::TokenExpired;
    }
  }

  async fn validate_token_with_api(
    &self,
    platform: &PlatformTypeModel,
    access_token: &Option<String>,
    config: &OAuthProviderConfig,
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

  async fn update_account_auth_status(
    &self,
    account: &mut AuthAccountModel,
    platform: &PlatformTypeModel,
    config: &OAuthProviderConfig,
  ) -> Option<bool> {
    if account.auth_status != AuthStatusModel::Authorized {
      return None;
    }
    match self
      .validate_token_with_api(platform, &account.access_token, config)
      .await
    {
      Ok(true) => {
        account.auth_status = AuthStatusModel::Authorized;
        Some(true)
      }
      Ok(false) => {
        account.auth_status = AuthStatusModel::Revoked;
        Some(false)
      }
      Err(_) => None,
    }
  }
}
