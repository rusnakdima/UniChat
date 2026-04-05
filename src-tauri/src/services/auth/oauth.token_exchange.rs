//! OAuth token exchange module
//! Handles exchanging authorization codes for access tokens

use reqwest::Client;
use serde_json::Value;

use crate::helpers::oauth_config_helper::OAuthProviderConfig;
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::platform_type_model::PlatformTypeModel;

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
  _platform: &PlatformTypeModel,
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
