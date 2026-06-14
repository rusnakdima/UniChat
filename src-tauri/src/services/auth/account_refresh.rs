//! Account Token Refresh
//! Handles token refresh logic

use crate::{log_debug, log_info};

use crate::helpers::oauth_config_helper::get_oauth_provider_config;
use crate::models::auth_account_model::{AuthAccountModel, AuthStatusModel};
use crate::models::platform_type_model::PlatformTypeModel;
use crate::services::auth::oauth_internal::refresh_access_token;

use super::AccountService;

impl AccountService {
  pub async fn refresh_token(
    &self,
    platform: &PlatformTypeModel,
    account_id: &str,
  ) -> Result<AuthAccountModel, String> {
    log_info!(
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

    log_debug!("Performing token refresh for account {}", account_id);
    let new_token = refresh_access_token(&self.http, &refresh_token, &config).await?;

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

    log_info!(
      "Token refreshed successfully for account {} on {:?}",
      account_id,
      platform
    );
    Ok(account)
  }
}
