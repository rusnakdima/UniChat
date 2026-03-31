//! OAuth identity fetch module
//! Fetches user identity from OAuth provider after token exchange

use reqwest::Client;
use serde_json::Value;

use crate::helpers::oauth_config_helper::OAuthProviderConfig;
use crate::models::auth_oauth_model::OAuthTokenModel;
use crate::models::platform_type_model::PlatformTypeModel;

/// Fetch user identity from OAuth provider
/// Returns (username, user_id) tuple
pub async fn fetch_identity(
  http: &Client,
  platform: &PlatformTypeModel,
  token: &OAuthTokenModel,
  config: &OAuthProviderConfig,
) -> Result<(String, String), String> {
  match platform {
    PlatformTypeModel::Kick => {
      // Kick doesn't have a standard userinfo endpoint
      // User info should be fetched from the token response or via a separate API call
      // For now, we need to fetch from Kick's user API
      fetch_kick_identity(http, &token.access_token).await
    }
    _ => {
      // Standard OAuth userinfo endpoint for Twitch and YouTube
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
          // Already handled above, but keep as fallback
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
  }
}

/// Fetch Kick user identity from the access token
/// Kick requires using the chat token to get user info
async fn fetch_kick_identity(
  http: &Client,
  access_token: &str,
) -> Result<(String, String), String> {
  // Try to get user info from Kick's chat token endpoint
  // Kick's OAuth token should contain user info, but we need to decode it
  // Alternatively, use the access token to fetch user profile

  let response = http
    .get("https://kick.com/api/v1/user")
    .header("Authorization", format!("Bearer {}", access_token))
    .header("Accept", "application/json")
    .send()
    .await
    .map_err(|e| format!("Kick user info request failed: {e}"))?;

  let status = response.status();
  let payload: Value = response
    .json()
    .await
    .map_err(|e| format!("Kick userinfo parse failed: {e}"))?;

  if !status.is_success() {
    return Err(format!(
      "Kick userinfo request failed ({}): {}",
      status, payload
    ));
  }

  // Extract user info from Kick's response
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
