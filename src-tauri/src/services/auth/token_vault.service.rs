use keyring::Entry;

use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::provider_contract_model::PlatformTypeModel;

pub struct TokenVaultService {
  service_name: String,
}

impl TokenVaultService {
  pub fn new() -> Self {
    Self {
      service_name: "unichat".to_string(),
    }
  }

  pub fn saveToken(
    &self,
    platform: &PlatformTypeModel,
    token: &OAuthTokenModel,
  ) -> Result<(), String> {
    let entry = Entry::new(&self.service_name, &format!("oauth-{}", platform.asKey()))
      .map_err(|e| format!("keyring init failed: {e}"))?;
    let serialized =
      serde_json::to_string(token).map_err(|e| format!("token serialize failed: {e}"))?;
    entry
      .set_password(&serialized)
      .map_err(|e| format!("token save failed: {e}"))
  }

  pub fn readToken(&self, platform: &PlatformTypeModel) -> Result<Option<OAuthTokenModel>, String> {
    let entry = Entry::new(&self.service_name, &format!("oauth-{}", platform.asKey()))
      .map_err(|e| format!("keyring init failed: {e}"))?;

    match entry.get_password() {
      Ok(raw) => {
        let token = serde_json::from_str::<OAuthTokenModel>(&raw)
          .map_err(|e| format!("token parse failed: {e}"))?;
        Ok(Some(token))
      }
      Err(keyring::Error::NoEntry) => Ok(None),
      Err(e) => Err(format!("token read failed: {e}")),
    }
  }

  pub fn deleteToken(&self, platform: &PlatformTypeModel) -> Result<(), String> {
    let entry = Entry::new(&self.service_name, &format!("oauth-{}", platform.asKey()))
      .map_err(|e| format!("keyring init failed: {e}"))?;
    match entry.delete_credential() {
      Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
      Err(e) => Err(format!("token delete failed: {e}")),
    }
  }
}

trait PlatformKey {
  fn asKey(&self) -> &'static str;
}

impl PlatformKey for PlatformTypeModel {
  fn asKey(&self) -> &'static str {
    match self {
      PlatformTypeModel::Twitch => "twitch",
      PlatformTypeModel::Kick => "kick",
      PlatformTypeModel::Youtube => "youtube",
    }
  }
}
