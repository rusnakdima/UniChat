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
      // Use Kick's official API to fetch user identity
      // Endpoint: GET https://api.kick.com/public/v1/users (without id param = current user)
      // Required scope: user:read
      // Response format: { "data": [{ "user_id": 123, "name": "username", ... }], "message": "OK" }
      let response = http
        .get("https://api.kick.com/public/v1/users")
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("Kick identity request failed: {e}"))?;

      let status = response.status();
      
      // Debug: log the raw response
      let raw_body = response.text().await.unwrap_or_default();
      println!("[Kick OAuth] Identity response status: {}", status);
      println!("[Kick OAuth] Identity response body: {}", raw_body);
      
      if !status.is_success() {
        // If identity fetch fails, return placeholder - frontend will prompt user
        println!("[Kick OAuth] Identity fetch failed with status {}, using placeholder", status);
        return Ok(("kick-user".to_string(), "kick-unknown".to_string()));
      }

      let payload: Value = serde_json::from_str(&raw_body)
        .map_err(|e| format!("Kick identity parse failed: {e}"))?;

      println!("[Kick OAuth] Identity parsed JSON: {:?}", payload);

      // Extract username and user ID from response
      // Response format: { "data": [{ "user_id": 123, "name": "username", ... }] }
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

          println!("[Kick OAuth] Identity fetched: username={}, user_id={}", username, user_id);
          return Ok((username, user_id));
        }
      }

      // Fallback if structure unexpected
      println!("[Kick OAuth] Could not parse user data from response");
      Ok(("kick-user".to_string(), "kick-unknown".to_string()))
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
        _ => unreachable!(),
      }
    }
  }
}
