use std::collections::HashMap;
use std::sync::Mutex;

use base64::Engine;
use chrono::{Duration, Utc};
use reqwest::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use url::Url;

use crate::helpers::oauth_config_helper::getOAuthProviderConfig;
use crate::models::auth_account_model::{AuthAccountModel, AuthStatusModel};
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::provider_contract_model::PlatformTypeModel;
use crate::services::auth::oauth_loopback_service::OAuthLoopbackService;
use crate::services::auth::oauth_state_service::OAuthStateService;
use crate::services::auth::token_vault_service::TokenVaultService;

pub struct OAuthProviderService {
  http: Client,
  oauthStateService: OAuthStateService,
  oauthLoopbackService: OAuthLoopbackService,
  tokenVaultService: TokenVaultService,
  accountStore: Mutex<HashMap<String, AuthAccountModel>>,
}

impl OAuthProviderService {
  pub fn new() -> Self {
    Self {
      http: Client::new(),
      oauthStateService: OAuthStateService::new(),
      oauthLoopbackService: OAuthLoopbackService::new(),
      tokenVaultService: TokenVaultService::new(),
      accountStore: Mutex::new(HashMap::new()),
    }
  }

  pub fn startAuth(&self, platform: PlatformTypeModel) -> Result<String, String> {
    let config = getOAuthProviderConfig(&platform)?;
    let (host, port, path) = parseLoopbackRedirect(&config.redirect_uri)?;
    self
      .oauthLoopbackService
      .startListener(platform.asKey(), &host, port, &path)?;
    let session = self.oauthStateService.createSession(&platform)?;
    let codeChallenge = pkceChallenge(&session.code_verifier);
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
      .append_pair("code_challenge", &codeChallenge)
      .append_pair("code_challenge_method", "S256");

    Ok(url.to_string())
  }

  pub async fn awaitLoopbackAndComplete(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<AuthAccountModel, String> {
    let callbackUrl = self
      .oauthLoopbackService
      .waitForCallback(platform.asKey(), 240)?;
    self.completeAuth(platform, callbackUrl).await
  }

  pub async fn completeAuth(
    &self,
    platform: PlatformTypeModel,
    callback_url: String,
  ) -> Result<AuthAccountModel, String> {
    let callback = Url::parse(&callback_url).map_err(|e| format!("invalid callback url: {e}"))?;
    let params = extractCallbackParams(&callback);

    if let Some(errorCode) = params.get("error") {
      let description = params
        .get("error_description")
        .cloned()
        .unwrap_or_else(|| "authorization failed at provider".to_string());
      return Err(format!("{errorCode}: {description}"));
    }

    let code = params
      .get("code")
      .ok_or_else(|| "missing code parameter in callback".to_string())?;
    let state = params
      .get("state")
      .ok_or_else(|| "missing state parameter in callback".to_string())?;
    let session = self.oauthStateService.consumeSession(state)?;
    let config = getOAuthProviderConfig(&platform)?;

    let token = self
      .exchangeCode(&platform, code, &session.code_verifier, &config)
      .await?;
    self.tokenVaultService.saveToken(&platform, &token)?;

    let (username, userId) = self.fetchIdentity(&platform, &token, &config).await?;
    let expiresAt = token
      .expires_in_seconds
      .map(|seconds| (Utc::now() + Duration::seconds(seconds)).to_rfc3339());
    let account = AuthAccountModel {
      platform: platform.clone(),
      username,
      user_id: userId,
      access_token: Some(token.access_token.clone()),
      refresh_token: token.refresh_token.clone(),
      auth_status: AuthStatusModel::Authorized,
      token_expires_at: expiresAt,
      authorized_at: Utc::now().to_rfc3339(),
    };

    let mut guard = self
      .accountStore
      .lock()
      .map_err(|_| "account store lock poisoned".to_string())?;
    guard.insert(platform.asKey().to_string(), account.clone());
    Ok(account)
  }

  pub fn getAuthStatus(
    &self,
    platform: PlatformTypeModel,
  ) -> Result<Option<AuthAccountModel>, String> {
    let guard = self
      .accountStore
      .lock()
      .map_err(|_| "account store lock poisoned".to_string())?;
    Ok(guard.get(platform.asKey()).cloned())
  }

  pub async fn disconnect(&self, platform: PlatformTypeModel) -> Result<(), String> {
    let token = self.tokenVaultService.readToken(&platform)?;
    if let Some(savedToken) = token {
      let config = getOAuthProviderConfig(&platform)?;
      if let Some(revokeUrl) = config.revoke_url {
        let mut form: Vec<(&str, &str)> = vec![
          ("client_id", &config.client_id),
          ("token", &savedToken.access_token),
        ];
        if let Some(ref secret) = config.client_secret {
          form.push(("client_secret", secret));
        }
        let _ = self
          .http
          .post(revokeUrl)
          .form(&form)
          .send()
          .await;
      }
    }

    self.tokenVaultService.deleteToken(&platform)?;
    let mut guard = self
      .accountStore
      .lock()
      .map_err(|_| "account store lock poisoned".to_string())?;
    guard.remove(platform.asKey());
    Ok(())
  }

  async fn exchangeCode(
    &self,
    platform: &PlatformTypeModel,
    code: &str,
    verifier: &str,
    config: &crate::helpers::oauth_config_helper::OAuthProviderConfig,
  ) -> Result<OAuthTokenModel, String> {
    let mut form: Vec<(&str, String)> = vec![
      ("client_id", config.client_id.clone()),
      ("code", code.to_string()),
      ("grant_type", "authorization_code".to_string()),
      ("redirect_uri", config.redirect_uri.clone()),
    ];

    if let Some(ref secret) = config.client_secret {
      form.push(("client_secret", secret.clone()));
    }

    if !matches!(platform, PlatformTypeModel::Youtube) {
      form.push(("code_verifier", verifier.to_string()));
    }

    let response = self
      .http
      .post(&config.token_url)
      .form(&form)
      .send()
      .await
      .map_err(|e| format!("token request failed: {e}"))?;
    let status = response.status();
    let payload: Value = response
      .json()
      .await
      .map_err(|e| format!("token response parse failed: {e}"))?;
    if !status.is_success() {
      return Err(format!("token exchange failed: {payload}"));
    }

    Ok(OAuthTokenModel {
      access_token: payload["access_token"]
        .as_str()
        .ok_or_else(|| "missing access_token in token response".to_string())?
        .to_string(),
      refresh_token: payload["refresh_token"].as_str().map(|v| v.to_string()),
      expires_in_seconds: payload["expires_in"].as_i64(),
    })
  }

  async fn fetchIdentity(
    &self,
    platform: &PlatformTypeModel,
    token: &OAuthTokenModel,
    config: &crate::helpers::oauth_config_helper::OAuthProviderConfig,
  ) -> Result<(String, String), String> {
    let mut request = self
      .http
      .get(&config.userinfo_url)
      .bearer_auth(&token.access_token);
    if matches!(platform, PlatformTypeModel::Twitch) {
      request = request.header("Client-Id", &config.client_id);
    }

    let response = request
      .send()
      .await
      .map_err(|e| format!("userinfo request failed: {e}"))?;
    let status = response.status();
    let payload: Value = response
      .json()
      .await
      .map_err(|e| format!("userinfo parse failed: {e}"))?;
    if !status.is_success() {
      return Err(format!("userinfo request failed: {payload}"));
    }

    match platform {
      PlatformTypeModel::Twitch => {
        let first = payload["data"]
          .as_array()
          .and_then(|items| items.first())
          .ok_or_else(|| "twitch userinfo payload missing data".to_string())?;
        let username = first["login"].as_str().unwrap_or("twitch-user").to_string();
        let userId = first["id"].as_str().unwrap_or("unknown").to_string();
        Ok((username, userId))
      }
      PlatformTypeModel::Youtube => {
        let username = payload["name"]
          .as_str()
          .unwrap_or("youtube-user")
          .to_string();
        let userId = payload["id"].as_str().unwrap_or("unknown").to_string();
        Ok((username, userId))
      }
      PlatformTypeModel::Kick => {
        let username = payload["username"]
          .as_str()
          .or_else(|| payload["name"].as_str())
          .unwrap_or("kick-user")
          .to_string();
        let userId = if let Some(id) = payload["id"].as_str() {
          id.to_string()
        } else if let Some(id) = payload["id"].as_i64() {
          id.to_string()
        } else {
          "unknown".to_string()
        };
        Ok((username, userId))
      }
    }
  }
}

fn extractCallbackParams(callback: &Url) -> HashMap<String, String> {
  let mut params: HashMap<String, String> = callback.query_pairs().into_owned().collect();

  if params.is_empty() {
    if let Some(fragment) = callback.fragment() {
      for (key, value) in url::form_urlencoded::parse(fragment.as_bytes()) {
        params.insert(key.into_owned(), value.into_owned());
      }
    }
  }

  params
}

fn pkceChallenge(codeVerifier: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(codeVerifier.as_bytes());
  let hashed = hasher.finalize();
  base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hashed)
}

fn parseLoopbackRedirect(redirectUri: &str) -> Result<(String, u16, String), String> {
  let parsed = Url::parse(redirectUri).map_err(|e| format!("invalid redirect uri: {e}"))?;
  if parsed.scheme() != "http" && parsed.scheme() != "https" {
    return Err("redirect uri must use http/https for loopback flow".to_string());
  }

  let host = parsed
    .host_str()
    .ok_or_else(|| "redirect uri host is missing".to_string())?
    .to_string();
  let port = parsed
    .port_or_known_default()
    .ok_or_else(|| "redirect uri port is missing".to_string())?;
  let path = if parsed.path().is_empty() {
    "/".to_string()
  } else {
    parsed.path().to_string()
  };
  Ok((host, port, path))
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
