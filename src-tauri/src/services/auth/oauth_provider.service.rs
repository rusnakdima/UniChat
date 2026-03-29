//! OAuth Provider Service
//! Orchestrates the OAuth authentication flow across platforms

use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{Duration, Utc};
use reqwest::Client;
use url::Url;

use crate::constants::OAUTH_CALLBACK_TIMEOUT_SECS;
use crate::helpers::oauth_config_helper::get_oauth_provider_config;
use crate::models::auth_account_model::{AuthAccountModel, AuthStatusModel};
use crate::models::platform_type_model::{PlatformKey, PlatformTypeModel};
use crate::services::auth::oauth_helpers::{
  extract_callback_params, parse_loopback_redirect, pkce_challenge,
};
use crate::services::auth::oauth_identity_fetch::fetch_identity;
use crate::services::auth::oauth_loopback_service::OAuthLoopbackService;
use crate::services::auth::oauth_state_service::OAuthStateService;
use crate::services::auth::oauth_token_exchange::exchange_code_for_token;
use crate::services::auth::token_vault_service::TokenVaultService;

/// OAuth Provider Service - orchestrates OAuth flows
pub struct OAuthProviderService {
  http: Client,
  oauth_state_service: OAuthStateService,
  oauth_loopback_service: OAuthLoopbackService,
  token_vault_service: TokenVaultService,
  account_store: Mutex<HashMap<String, AuthAccountModel>>,
}

impl Default for OAuthProviderService {
  fn default() -> Self {
    Self::new()
  }
}

impl OAuthProviderService {
  /// Create a new OAuth provider service
  pub fn new() -> Self {
    Self {
      http: Client::new(),
      oauth_state_service: OAuthStateService::new(),
      oauth_loopback_service: OAuthLoopbackService::new(),
      token_vault_service: TokenVaultService::new(),
      account_store: Mutex::new(HashMap::new()),
    }
  }

  /// Start OAuth authentication flow
  /// Returns the authorization URL to redirect the user to
  pub fn start_auth(&self, platform: PlatformTypeModel) -> Result<String, String> {
    let config = get_oauth_provider_config(&platform)?;
    let (host, port, path) = parse_loopback_redirect(&config.redirect_uri)?;
    self
      .oauth_loopback_service
      .start_listener(platform.as_key(), &host, port, &path)?;
    let session = self.oauth_state_service.create_session(&platform)?;
    let code_challenge = pkce_challenge(&session.code_verifier);
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

    Ok(url.to_string())
  }

  /// Wait for OAuth callback and complete authentication
  pub async fn await_loopback_and_complete(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<AuthAccountModel, String> {
    let callback_url = self
      .oauth_loopback_service
      .wait_for_callback(platform.as_key(), OAUTH_CALLBACK_TIMEOUT_SECS)?;
    self.complete_auth(platform, callback_url).await
  }

  /// Complete OAuth authentication with callback URL
  pub async fn complete_auth(
    &self,
    platform: PlatformTypeModel,
    callback_url: String,
  ) -> Result<AuthAccountModel, String> {
    let callback = Url::parse(&callback_url).map_err(|e| format!("invalid callback url: {e}"))?;
    let params = extract_callback_params(&callback);

    if let Some(error_code) = params.get("error") {
      let description = params
        .get("error_description")
        .cloned()
        .unwrap_or_else(|| "authorization failed at provider".to_string());
      return Err(format!("{error_code}: {description}"));
    }

    let code = params
      .get("code")
      .ok_or_else(|| "missing code parameter in callback".to_string())?;
    let state = params
      .get("state")
      .ok_or_else(|| "missing state parameter in callback".to_string())?;
    let session = self.oauth_state_service.consume_session(state)?;
    let config = get_oauth_provider_config(&platform)?;

    let token =
      exchange_code_for_token(&self.http, &platform, code, &session.code_verifier, &config).await?;
    let (username, user_id) = fetch_identity(&self.http, &platform, &token, &config).await?;
    let expires_at = token
      .expires_in_seconds
      .map(|seconds| (Utc::now() + Duration::seconds(seconds)).to_rfc3339());
    let account = AuthAccountModel {
      id: format!("acc-{}-{}", platform.as_key(), user_id),
      platform: platform.clone(),
      username,
      user_id,
      access_token: Some(token.access_token.clone()),
      refresh_token: token.refresh_token.clone(),
      auth_status: AuthStatusModel::Authorized,
      token_expires_at: expires_at,
      authorized_at: Utc::now().to_rfc3339(),
    };
    self.token_vault_service.upsert_account(&account)?;
    self.token_vault_service.save_token(&account, &token)?;

    let mut guard = self
      .account_store
      .lock()
      .map_err(|_| "account store lock poisoned".to_string())?;
    guard.insert(account.id.clone(), account.clone());
    Ok(account)
  }

  /// Get authentication status for a platform
  pub fn get_auth_status(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<Vec<AuthAccountModel>, String> {
    let saved = self.token_vault_service.read_accounts(&platform)?;
    let mut guard = self
      .account_store
      .lock()
      .map_err(|_| "account store lock poisoned".to_string())?;

    for account in &saved {
      guard.insert(account.id.clone(), account.clone());
    }

    Ok(saved)
  }

  /// Disconnect an account and revoke tokens
  pub async fn disconnect(
    &self,
    platform: PlatformTypeModel,
    account_id: String,
  ) -> Result<(), String> {
    let token = self
      .token_vault_service
      .read_token(&platform, &account_id)?;
    if let Some(saved_token) = token {
      let config = get_oauth_provider_config(&platform)?;
      if let Some(revoke_url) = config.revoke_url {
        let mut form: Vec<(&str, &str)> = vec![
          ("client_id", &config.client_id),
          ("token", &saved_token.access_token),
        ];
        if let Some(ref secret) = config.client_secret {
          form.push(("client_secret", secret));
        }
        // Attempt token revocation (best effort)
        match self.http.post(revoke_url).form(&form).send().await {
          Ok(response) => {
            if !response.status().is_success() {
              // Token revocation failed (best effort, ignore)
            }
          }
          Err(_) => {
            // Token revocation request failed (best effort, ignore)
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
    let mut guard = self
      .account_store
      .lock()
      .map_err(|_| "account store lock poisoned".to_string())?;
    guard.remove(&account_id);
    Ok(())
  }
}
