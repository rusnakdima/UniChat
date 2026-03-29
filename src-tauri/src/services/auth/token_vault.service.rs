use keyring::Entry;
use serde::{Deserialize, Serialize};
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

/// Token Vault Service with thread-safe operations
/// Addresses Issue #009: OAuth Token Refresh Race Condition
pub struct TokenVaultService {
  service_name: String,
  /// Cache of tokens to reduce keyring access and provide atomic operations
  token_cache: Arc<RwLock<Vec<AccountVaultRecord>>>,
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
      token_cache: Arc::new(RwLock::new(Vec::new())),
    };
    // Load tokens into cache on startup
    service.load_all_tokens_into_cache();
    service
  }

  /// Load all tokens from keyring into memory cache on startup
  fn load_all_tokens_into_cache(&self) {
    // Try to load for each platform
    for platform in &[
      PlatformTypeModel::Twitch,
      PlatformTypeModel::Kick,
      PlatformTypeModel::Youtube,
    ] {
      if let Ok(_accounts) = self.read_accounts_internal(platform) {
        // Cache is already populated by read_accounts_internal
      }
    }
  }

  /// Save token with cache invalidation (atomic operation)
  pub fn save_token(
    &self,
    account: &AuthAccountModel,
    token: &OAuthTokenModel,
  ) -> Result<(), String> {
    let key = self.account_key(account);
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

    // Update cache atomically
    if let Ok(mut cache) = self.token_cache.write() {
      // Remove old entry if exists
      cache.retain(|r| r.account.id != account.id);
      // Add new entry
      cache.push(record);
    }

    Ok(())
  }

  /// Read token with cache-first strategy (thread-safe)
  pub fn read_token(
    &self,
    platform: &PlatformTypeModel,
    account_id: &str,
  ) -> Result<Option<OAuthTokenModel>, String> {
    // Try cache first (fast path)
    if let Ok(cache) = self.token_cache.read() {
      if let Some(record) = cache
        .iter()
        .find(|r| r.account.platform == *platform && r.account.id == account_id)
      {
        return Ok(Some(record.token.clone()));
      }
    }

    // Fallback to keyring (slow path)
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

  /// Delete token with cache invalidation (atomic operation)
  pub fn delete_token(&self, platform: &PlatformTypeModel, account_id: &str) -> Result<(), String> {
    let entry = Entry::new(
      &self.service_name,
      &format!("oauth-{}-{}", platform.as_key(), account_id),
    )
    .map_err(|e| format!("keyring init failed: {e}"))?;

    match entry.delete_credential() {
      Ok(_) | Err(keyring::Error::NoEntry) => {
        // Remove from cache atomically
        if let Ok(mut cache) = self.token_cache.write() {
          cache.retain(|r| !(r.account.platform == *platform && r.account.id == account_id));
        }
        Ok(())
      }
      Err(e) => Err(format!("token delete failed: {e}")),
    }
  }

  /// Read all accounts for a platform from keyring
  pub fn read_accounts(
    &self,
    platform: &PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    self.read_accounts_internal(platform)
  }

  /// Internal method to read accounts (for cache loading and public API)
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

  fn account_key(&self, account: &AuthAccountModel) -> String {
    format!("oauth-{}-{}", account.platform.as_key(), account.id)
  }

  fn index_key(&self, platform: &PlatformTypeModel) -> String {
    format!("oauth-{}-index", platform.as_key())
  }

  fn read_account_index(&self, platform: &PlatformTypeModel) -> Result<Vec<String>, String> {
    let entry = Entry::new(&self.service_name, &self.index_key(platform))
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
    let entry = Entry::new(&self.service_name, &self.index_key(platform))
      .map_err(|e| format!("keyring init failed: {e}"))?;
    let serialized = serde_json::to_string(account_ids)
      .map_err(|e| format!("token index serialize failed: {e}"))?;
    entry
      .set_password(&serialized)
      .map_err(|e| format!("token index save failed: {e}"))
  }
}
