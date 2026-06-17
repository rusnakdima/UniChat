use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::models::auth_account_model::AuthAccountModel;
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::platform_type_model::{PlatformKey, PlatformTypeModel};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountVaultRecord {
  account: AuthAccountModel,
  token: OAuthTokenModel,
}

pub struct TokenVaultService {
  service_name: String,
  token_cache: Arc<RwLock<HashMap<String, AccountVaultRecord>>>,
}

impl Default for TokenVaultService {
  fn default() -> Self {
    Self::new()
  }
}

impl TokenVaultService {
  pub fn new() -> Self {
    let service = Self {
      service_name: "unichat".to_string(),
      token_cache: Arc::new(RwLock::new(HashMap::new())),
    };
    service.load_all_tokens_into_cache();
    service
  }

  fn load_all_tokens_into_cache(&self) {
    for platform in &[
      PlatformTypeModel::Twitch,
      PlatformTypeModel::Kick,
      PlatformTypeModel::Youtube,
    ] {
      if let Ok(_accounts) = self.read_accounts_internal(platform) {}
    }
  }

  pub fn save_token(
    &self,
    account: &AuthAccountModel,
    token: &OAuthTokenModel,
  ) -> Result<(), String> {
    let key = format!("oauth-{}-{}", account.platform.as_key(), account.id);
    let entry =
      Entry::new(&self.service_name, &key).map_err(|e| format!("keyring init failed: {e}"))?;

    let record = AccountVaultRecord {
      account: account.clone(),
      token: token.clone(),
    };

    let serialized =
      serde_json::to_string(&record).map_err(|e| format!("token serialize failed: {e}"))?;

    entry
      .set_password(&serialized)
      .map_err(|e| format!("token save failed: {e}"))?;

    let cache_key = format!("{}-{}", account.platform.as_key(), account.id);

    if let Ok(mut cache) = self.token_cache.write() {
      cache.insert(cache_key, record);
    }

    Ok(())
  }

  pub fn read_token(
    &self,
    platform: &PlatformTypeModel,
    account_id: &str,
  ) -> Result<Option<OAuthTokenModel>, String> {
    let cache_key = format!("{}-{}", platform.as_key(), account_id);

    if let Ok(cache) = self.token_cache.read() {
      if let Some(record) = cache.get(&cache_key) {
        return Ok(Some(record.token.clone()));
      }
    }

    let entry = Entry::new(
      &self.service_name,
      &format!("oauth-{}-{}", platform.as_key(), account_id),
    )
    .map_err(|e| format!("keyring init failed: {e}"))?;

    match entry.get_password() {
      Ok(raw) => {
        let record = serde_json::from_str::<AccountVaultRecord>(&raw)
          .map_err(|e| format!("token parse failed: {e}"))?;
        Ok(Some(record.token))
      }
      Err(keyring::Error::NoEntry) => Ok(None),
      Err(e) => Err(format!("token read failed: {e}")),
    }
  }

  pub fn delete_token(&self, platform: &PlatformTypeModel, account_id: &str) -> Result<(), String> {
    let entry = Entry::new(
      &self.service_name,
      &format!("oauth-{}-{}", platform.as_key(), account_id),
    )
    .map_err(|e| format!("keyring init failed: {e}"))?;

    match entry.delete_credential() {
      Ok(_) | Err(keyring::Error::NoEntry) => {
        let cache_key = format!("{}-{}", platform.as_key(), account_id);
        if let Ok(mut cache) = self.token_cache.write() {
          cache.remove(&cache_key);
        }
        Ok(())
      }
      Err(e) => Err(format!("token delete failed: {e}")),
    }
  }

  pub fn read_accounts(
    &self,
    platform: &PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    self.read_accounts_internal(platform)
  }

  fn read_accounts_internal(
    &self,
    platform: &PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    let account_ids = self.read_account_index(platform)?;
    let mut accounts = Vec::new();

    for account_id in account_ids {
      let entry = Entry::new(
        &self.service_name,
        &format!("oauth-{}-{}", platform.as_key(), account_id),
      )
      .map_err(|e| format!("keyring init failed: {e}"))?;
      match entry.get_password() {
        Ok(raw) => {
          let record = serde_json::from_str::<AccountVaultRecord>(&raw)
            .map_err(|e| format!("token parse failed: {e}"))?;
          accounts.push(record.account);
        }
        Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(format!("token read failed: {e}")),
      }
    }

    Ok(accounts)
  }

  pub fn upsert_account(&self, account: &AuthAccountModel) -> Result<(), String> {
    let mut account_ids = self.read_account_index(&account.platform)?;
    if !account_ids.iter().any(|id| id == &account.id) {
      account_ids.push(account.id.clone());
      self.write_account_index(&account.platform, &account_ids)?;
    }
    Ok(())
  }

  pub fn remove_account(
    &self,
    platform: &PlatformTypeModel,
    account_id: &str,
  ) -> Result<(), String> {
    let mut account_ids = self.read_account_index(platform)?;
    account_ids.retain(|id| id != account_id);
    self.write_account_index(platform, &account_ids)
  }

  fn read_account_index(&self, platform: &PlatformTypeModel) -> Result<Vec<String>, String> {
    let entry = Entry::new(
      &self.service_name,
      &format!("oauth-{}-index", platform.as_key()),
    )
    .map_err(|e| format!("keyring init failed: {e}"))?;

    match entry.get_password() {
      Ok(raw) => serde_json::from_str::<Vec<String>>(&raw)
        .map_err(|e| format!("token index parse failed: {e}")),
      Err(keyring::Error::NoEntry) => Ok(Vec::new()),
      Err(e) => Err(format!("token index read failed: {e}")),
    }
  }

  fn write_account_index(
    &self,
    platform: &PlatformTypeModel,
    account_ids: &[String],
  ) -> Result<(), String> {
    let entry = Entry::new(
      &self.service_name,
      &format!("oauth-{}-index", platform.as_key()),
    )
    .map_err(|e| format!("keyring init failed: {e}"))?;
    let serialized = serde_json::to_string(account_ids)
      .map_err(|e| format!("token index serialize failed: {e}"))?;
    entry
      .set_password(&serialized)
      .map_err(|e| format!("token index save failed: {e}"))
  }
}
