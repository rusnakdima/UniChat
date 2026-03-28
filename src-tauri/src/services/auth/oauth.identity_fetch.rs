//! OAuth identity fetch module
//! Fetches user identity from OAuth provider after token exchange

use reqwest::Client;
use serde_json::Value;

use crate::helpers::oauth_config_helper::OAuthProviderConfig;
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::provider_contract_model::PlatformTypeModel;

/// Fetch user identity from OAuth provider
/// Returns (username, user_id) tuple
pub async fn fetch_identity(
  http: &Client,
  platform: &PlatformTypeModel,
  token: &OAuthTokenModel,
  config: &OAuthProviderConfig,
) -> Result<(String, String), String> {
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
      Ok((username, user_id))
    }
    PlatformTypeModel::Youtube => {
      let username = payload["name"]
        .as_str()
        .unwrap_or("youtube-user")
        .to_string();
      let user_id = payload["id"].as_str().unwrap_or("unknown").to_string();
      Ok((username, user_id))
    }
    PlatformTypeModel::Kick => {
      let username = payload["username"]
        .as_str()
        .or_else(|| payload["name"].as_str())
        .unwrap_or("kick-user")
        .to_string();
      let user_id = if let Some(id) = payload["id"].as_str() {
        id.to_string()
      } else if let Some(id) = payload["id"].as_i64() {
        id.to_string()
      } else {
        "unknown".to_string()
      };
      Ok((username, user_id))
    }
  }
}
