//! Account Authentication Flow
//! Handles OAuth authentication initiation and completion

use log;

use crate::models::auth_account_model::AuthAccountModel;
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::platform_type_model::PlatformTypeModel;

use super::AccountService;

impl AccountService {
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
}
