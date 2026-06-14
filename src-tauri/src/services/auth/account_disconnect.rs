//! Account Disconnect
//! Handles account disconnection and token revocation

use crate::{log_debug, log_info, log_warn};

use crate::helpers::config_helper::SharedConfig;
use crate::helpers::oauth_config_helper::get_oauth_provider_config;
use crate::models::platform_type_model::PlatformTypeModel;

use super::AccountService;

impl AccountService {
  pub async fn disconnect(
    &self,
    platform: PlatformTypeModel,
    account_id: String,
  ) -> Result<(), String> {
    log_info!("Disconnecting account {} on {:?}", account_id, platform);
    self.revoke_token_if_possible(&platform, &account_id).await;

    self
      .token_vault_service
      .delete_token(&platform, &account_id)?;
    self
      .token_vault_service
      .remove_account(&platform, &account_id)?;
    log_info!("Account {} disconnected successfully", account_id);
    Ok(())
  }

  pub fn validate_token_for_role(&self, token: &str, role: &str) -> Result<(), String> {
    self
      .token_vault_service
      .validate_token_for_role(token, role)
  }

  async fn revoke_token_if_possible(&self, platform: &PlatformTypeModel, account_id: &str) {
    let Some(saved_token) = self
      .token_vault_service
      .read_token(platform, account_id)
      .ok()
      .flatten()
    else {
      return;
    };

    let Ok(config) = get_oauth_provider_config(platform, &SharedConfig::default()) else {
      return;
    };

    let Some(revoke_url) = config.revoke_url else {
      return;
    };

    log_debug!(
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

    if let Ok(response) = self.http.post(revoke_url).form(&form).send().await {
      if !response.status().is_success() {
        log_warn!("Token revoke request failed for account {}", account_id);
      }
    }
  }
}
