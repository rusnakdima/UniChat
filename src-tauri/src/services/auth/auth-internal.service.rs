//! OAuth internal helpers module
//! Provides utility functions for OAuth flow (PKCE, callback parsing, redirect parsing, token exchange, identity fetch)
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::platform_type_model::PlatformTypeModel;
use crate::utils::oauth_config_helper::OAuthProviderConfig;
use base64::Engine;
use reqwest::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use url::Url;
pub(crate) fn extract_callback_params(callback: &Url) -> HashMap<String, String> {
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
pub(crate) fn pkce_challenge(code_verifier: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(code_verifier.as_bytes());
  let hashed = hasher.finalize();
  base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hashed)
}
pub(crate) fn parse_loopback_redirect(redirect_uri: &str) -> Result<(String, u16, String), String> {
  let parsed = Url::parse(redirect_uri).map_err(|e| format!("invalid redirect uri: {e}"))?;
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
pub async fn exchange_code_for_token(
  http: &Client,
  platform: &PlatformTypeModel,
  code: &str,
  code_verifier: &str,
  config: &OAuthProviderConfig,
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
    form.push(("code_verifier", code_verifier.to_string()));
  }
  let response = http
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
pub async fn refresh_access_token(
  http: &Client,
  refresh_token: &str,
  config: &OAuthProviderConfig,
) -> Result<OAuthTokenModel, String> {
  let mut form: Vec<(&str, String)> = vec![
    ("client_id", config.client_id.clone()),
    ("grant_type", "refresh_token".to_string()),
    ("refresh_token", refresh_token.to_string()),
  ];
  if let Some(ref secret) = config.client_secret {
    form.push(("client_secret", secret.clone()));
  }
  let response = http
    .post(&config.token_url)
    .form(&form)
    .send()
    .await
    .map_err(|e| format!("token refresh request failed: {e}"))?;
  let status = response.status();
  let body = response
    .text()
    .await
    .map_err(|e| format!("token refresh response read failed: {e}"))?;
  if !status.is_success() {
    return Err(format!("token refresh failed ({status}): {body}"));
  }
  let payload: Value = serde_json::from_str(&body)
    .map_err(|e| format!("token refresh response parse failed: {e}. Body: {body}"))?;
  let new_refresh_token = payload["refresh_token"]
    .as_str()
    .map(|v| v.to_string())
    .or_else(|| Some(refresh_token.to_string()));
  Ok(OAuthTokenModel {
    access_token: payload["access_token"]
      .as_str()
      .ok_or_else(|| "missing access_token in refresh response".to_string())?
      .to_string(),
    refresh_token: new_refresh_token,
    expires_in_seconds: payload["expires_in"].as_i64(),
  })
}
pub async fn fetch_identity(
  http: &Client,
  platform: &PlatformTypeModel,
  token: &OAuthTokenModel,
  config: &OAuthProviderConfig,
) -> Result<(String, String, Option<String>), String> {
  match platform {
    PlatformTypeModel::Kick => {
      let response = http
        .get("https://api.kick.com/public/v1/users")
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("Kick identity request failed: {e}"))?;
      let status = response.status();
      let raw_body = response.text().await.unwrap_or_default();
      if !status.is_success() {
        return Err(format!("Kick identity request failed: HTTP {}", status));
      }
      let payload: Value =
        serde_json::from_str(&raw_body).map_err(|e| format!("Kick identity parse failed: {e}"))?;
      let data_array = payload["data"].as_array();
      if let Some(users) = data_array {
        if let Some(first_user) = users.first() {
          let username = first_user["name"]
            .as_str()
            .or_else(|| first_user["username"].as_str())
            .unwrap_or("kick-user")
            .to_string();
          let user_id = first_user["user_id"]
            .as_u64()
            .map(|id| id.to_string())
            .or_else(|| first_user["id"].as_u64().map(|id| id.to_string()))
            .or_else(|| first_user["user_id"].as_str().map(|s| s.to_string()))
            .or_else(|| first_user["id"].as_str().map(|s| s.to_string()))
            .unwrap_or("unknown".to_string());
          let avatar_url = first_user["profile_pic"]
            .as_str()
            .or_else(|| first_user["profilePic"].as_str())
            .or_else(|| first_user["avatar"].as_str())
            .map(|s| s.to_string());
          return Ok((username, user_id, avatar_url));
        }
      }
      Ok(("kick-user".to_string(), "kick-unknown".to_string(), None))
    }
    _ => {
      let mut request = http
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
          let user_id = first["id"].as_str().unwrap_or("unknown").to_string();
          let avatar_url = first["profile_image_url"].as_str().map(|s| s.to_string());
          Ok((username, user_id, avatar_url))
        }
        PlatformTypeModel::Youtube => {
          let username = payload["name"]
            .as_str()
            .unwrap_or("youtube-user")
            .to_string();
          let user_id = payload["id"].as_str().unwrap_or("unknown").to_string();
          let avatar_url = payload["picture"].as_str().map(|s| s.to_string());
          Ok((username, user_id, avatar_url))
        }
        _ => unreachable!(),
      }
    }
  }
}
