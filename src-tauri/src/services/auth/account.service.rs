//! Account Service
//! Handles account management, authentication status validation, and OAuth orchestration

use crate::models::auth_account_model::AuthAccountModel;
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::platform_type_model::PlatformTypeModel;
use crate::services::auth::auth_state::OAuthStateService;
use crate::{log_debug, log_error, log_info, log_warn};
use chrono::{Duration, Utc};
use reqwest::Client;
use url::Url;

use crate::constants::OAUTH_CALLBACK_TIMEOUT_SECS;
use crate::helpers::config_helper::SharedConfig;
use crate::helpers::http_client::shared_client;
use crate::helpers::oauth_config_helper::{get_oauth_provider_config, OAuthProviderConfig};
use crate::models::auth_account_model::AuthStatusModel;

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

impl AccountService {
  pub fn start_auth(&self, platform: PlatformTypeModel) -> Result<String, String> {
    self.oauth_service.start_auth(platform)
  }

  pub async fn await_loopback_and_complete(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<AuthAccountModel, String> {
    log_debug!("Waiting for OAuth callback for {:?}", platform);
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

impl AccountService {
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
}

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
    let new_token = crate::services::auth::auth_internal::refresh_access_token(
      &self.http,
      &refresh_token,
      &config,
    )
    .await?;

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
      form.push(("client_secret", secret.as_str()));
    }

    if let Ok(response) = self.http.post(revoke_url).form(&form).send().await {
      if !response.status().is_success() {
        log_warn!("Token revoke request failed for account {}", account_id);
      }
    }
  }
}

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

pub struct OAuthService {
  http: Client,
  oauth_state_service: OAuthStateService,
  oauth_loopback_service: OAuthLoopbackService,
}

impl Default for OAuthService {
  fn default() -> Self {
    Self::new()
  }
}

impl OAuthService {
  pub fn new() -> Self {
    Self {
      http: shared_client(),
      oauth_state_service: OAuthStateService::new(),
      oauth_loopback_service: OAuthLoopbackService::new(),
    }
  }

  pub fn start_auth(&self, platform: PlatformTypeModel) -> Result<String, String> {
    log_info!("Starting OAuth auth flow for platform: {:?}", platform);
    let config = get_oauth_provider_config(&platform, &SharedConfig::default())?;
    let (host, port, path) =
      crate::services::auth::auth_internal::parse_loopback_redirect(&config.redirect_uri)?;
    self
      .oauth_loopback_service
      .start_listener(platform.as_key(), &host, port, &path)?;
    let session = self.oauth_state_service.create_session(&platform)?;
    let code_challenge =
      crate::services::auth::auth_internal::pkce_challenge(&session.code_verifier);
    let scope = config.scopes.join(" ");

    let mut url =
      Url::parse(&config.authorize_url).map_err(|e| format!("invalid authorize url: {e}"))?;
    url
      .query_pairs_mut()
      .append_pair("client_id", &config.client_id)
      .append_pair("redirect_uri", &config.redirect_uri)
      .append_pair("response_type", "code")
      .append_pair("scope", &scope)
      .append_pair("state", &session.state)
      .append_pair("code_challenge", &code_challenge)
      .append_pair("code_challenge_method", "S256");

    log_info!("Generated auth URL for {:?}", platform);
    Ok(url.to_string())
  }

  pub fn wait_for_callback(&self, platform: PlatformTypeModel) -> Result<String, String> {
    log_debug!("Waiting for OAuth callback for {:?}", platform);
    self
      .oauth_loopback_service
      .wait_for_callback(platform.as_key(), OAUTH_CALLBACK_TIMEOUT_SECS)
  }

  pub async fn complete_auth(
    &self,
    platform: PlatformTypeModel,
    callback_url: String,
    config: &SharedConfig,
  ) -> Result<AuthAccountModel, String> {
    log_debug!("Completing OAuth for {:?}", platform);
    let callback = Url::parse(&callback_url).map_err(|e| format!("invalid callback url: {e}"))?;
    let params = crate::services::auth::auth_internal::extract_callback_params(&callback);

    if let Some(error_code) = params.get("error") {
      let description = params
        .get("error_description")
        .cloned()
        .unwrap_or_else(|| "authorization failed at provider".to_string());
      log_warn!(
        "OAuth authorization denied for {:?}: {} - {}",
        platform,
        error_code,
        description
      );
      return Err(format!("{error_code}: {description}"));
    }

    let code = params
      .get("code")
      .ok_or_else(|| "missing code parameter in callback".to_string())?;
    let state_param = params
      .get("state")
      .ok_or_else(|| "missing state parameter in callback".to_string())?;
    let session = self.oauth_state_service.consume_session(state_param)?;
    let config = get_oauth_provider_config(&platform, config)?;

    log_debug!("Exchanging code for token for {:?}", platform);
    let token = crate::services::auth::auth_internal::exchange_code_for_token(
      &self.http,
      &platform,
      code,
      &session.code_verifier,
      &config,
    )
    .await?;

    log_debug!("Fetching identity for {:?}", platform);
    let (username, user_id, avatar_url) =
      crate::services::auth::auth_internal::fetch_identity(&self.http, &platform, &token, &config)
        .await?;

    let expires_at = token
      .expires_in_seconds
      .map(|seconds| (Utc::now() + Duration::seconds(seconds)).to_rfc3339());
    let account = AuthAccountModel {
      id: format!("acc-{}-{}", platform.as_key(), user_id),
      platform: platform.clone(),
      username,
      user_id,
      avatar_url,
      access_token: Some(token.access_token.clone()),
      refresh_token: token.refresh_token.clone(),
      auth_status: AuthStatusModel::Authorized,
      token_expires_at: expires_at,
      authorized_at: Utc::now().to_rfc3339(),
    };

    log_info!(
      "OAuth completed successfully for {:?}, user: {}",
      platform,
      account.username
    );
    Ok(account)
  }
}

use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::Duration as StdDuration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::runtime::Handle;
use tokio::task::JoinHandle;

pub struct OAuthLoopbackService {
  pending_callbacks: Mutex<HashMap<String, Receiver<String>>>,
  join_handles: Mutex<Vec<JoinHandle<()>>>,
}

impl Default for OAuthLoopbackService {
  fn default() -> Self {
    Self::new()
  }
}

impl OAuthLoopbackService {
  pub fn new() -> Self {
    Self {
      pending_callbacks: Mutex::new(HashMap::new()),
      join_handles: Mutex::new(Vec::new()),
    }
  }

  pub fn start_listener(
    &self,
    platform_key: &str,
    host: &str,
    port: u16,
    callback_path: &str,
  ) -> Result<(), String> {
    let address = format!("{host}:{port}");
    log_info!(
      "Starting OAuth loopback listener for {} on {}:{}",
      platform_key,
      host,
      port
    );
    let (tx, rx) = mpsc::channel::<String>();

    {
      let mut guard = self
        .pending_callbacks
        .lock()
        .map_err(|_| "callback map lock poisoned".to_string())?;
      guard.insert(platform_key.to_string(), rx);
    }

    let expected_path = callback_path.to_string();
    let platform_key_owned = platform_key.to_string();
    let handle = Handle::current().spawn(async move {
      log_debug!(
        "OAuth callback task started for platform {}",
        platform_key_owned
      );

      let listener = match TcpListener::bind(&address).await {
        Ok(l) => l,
        Err(e) => {
          log_error!("Failed to bind loopback listener on {}: {}", address, e);
          return;
        }
      };

      match listener.accept().await {
        Ok((mut stream, _)) => {
          let mut buffer = [0_u8; 4096];
          let mut callback_url: Option<String> = None;

          match stream.read(&mut buffer).await {
            Ok(size) => {
              let request = String::from_utf8_lossy(&buffer[..size]).to_string();
              if let Some(first_line) = request.lines().next() {
                let parts: Vec<&str> = first_line.split_whitespace().collect();
                if parts.len() >= 2 {
                  let path_and_query = parts[1];
                  if path_and_query.starts_with(&expected_path) {
                    callback_url = Some(format!("http://{address}{path_and_query}"));
                  }
                }
              }
            }
            Err(e) => {
              log_warn!("Failed to read from stream: {}", e);
            }
          }

          let body = if callback_url.is_some() {
            "Authorization completed. You can close this tab."
          } else {
            "Authorization callback is invalid."
          };
          let status_line = if callback_url.is_some() {
            "HTTP/1.1 200 OK"
          } else {
            "HTTP/1.1 400 Bad Request"
          };
          let response = format!(
            "{status_line}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
          );

          let _ = stream.write_all(response.as_bytes()).await;
          if let Some(url) = callback_url {
            log_debug!("OAuth callback received for platform {}", platform_key_owned);
            if let Err(e) = tx.send(url) {
              log_warn!("OAuth callback receiver already dropped: {}", e);
            }
          }
        }
        Err(e) => {
          log_warn!("Failed to accept connection: {}", e);
        }
      }

      log_debug!(
        "OAuth callback task stopped for platform {}",
        platform_key_owned
      );
    });

    {
      let mut guard = self
        .join_handles
        .lock()
        .map_err(|_| "join handles lock poisoned".to_string())?;
      guard.push(handle);
    }

    log_info!(
      "OAuth loopback listener started successfully for {}",
      platform_key
    );
    Ok(())
  }

  pub fn wait_for_callback(
    &self,
    platform_key: &str,
    timeout_seconds: u64,
  ) -> Result<String, String> {
    log_debug!(
      "Waiting for OAuth callback for platform {} (timeout: {}s)",
      platform_key,
      timeout_seconds
    );
    let receiver = {
      let mut guard = self
        .pending_callbacks
        .lock()
        .map_err(|_| "callback map lock poisoned".to_string())?;
      guard.remove(platform_key).ok_or_else(|| {
        log_error!(
          "Callback listener not started for platform {}",
          platform_key
        );
        "callback listener is not started".to_string()
      })?
    };

    let timeout = StdDuration::from_secs(timeout_seconds);
    receiver.recv_timeout(timeout).map_err(|_| {
      log_warn!(
        "OAuth callback timeout for platform {} after {}s",
        platform_key,
        timeout_seconds
      );
      "authorization callback timeout".to_string()
    })
  }
}

impl Drop for OAuthLoopbackService {
  fn drop(&mut self) {
    let handles: Vec<_> = self.join_handles.lock().unwrap().drain(..).collect();
    for handle in handles {
      handle.abort();
    }
  }
}

use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};

use crate::models::platform_type_model::PlatformKey;

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
    let entry = Entry::new(&self.service_name, &format!("oauth-{}-index", platform.as_key()))
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
    let entry = Entry::new(&self.service_name, &format!("oauth-{}-index", platform.as_key()))
      .map_err(|e| format!("keyring init failed: {e}"))?;
    let serialized = serde_json::to_string(account_ids)
      .map_err(|e| format!("token index serialize failed: {e}"))?;
    entry
      .set_password(&serialized)
      .map_err(|e| format!("token index save failed: {e}"))
  }
}
