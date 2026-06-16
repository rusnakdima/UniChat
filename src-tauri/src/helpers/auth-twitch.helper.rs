use crate::helpers::config_helper::AppConfig;
use crate::helpers::http_client::shared_client;
use crate::helpers::oauth_config_helper::get_oauth_provider_config;
use crate::models::platform_type_model::PlatformTypeModel;
use serde::Deserialize;

#[derive(Deserialize)]
struct TwitchTokenBody {
  access_token: String,
}

/// Get Twitch OAuth client credentials from configuration
/// Returns (client_id, client_secret)
pub fn twitch_client_credentials(config: &AppConfig) -> Result<(String, Option<String>), String> {
  let cfg = get_oauth_provider_config(&PlatformTypeModel::Twitch, config)?;
  Ok((cfg.client_id, cfg.client_secret))
}

/// Exchange client credentials for an app access token
/// Used for API calls that don't require user authentication
pub async fn twitch_app_access_token(
  client_id: &str,
  client_secret: Option<&str>,
) -> Result<String, String> {
  let client = shared_client();

  let form = if let Some(secret) = client_secret {
    vec![
      ("client_id", client_id),
      ("client_secret", secret),
      ("grant_type", "client_credentials"),
    ]
  } else {
    return Err("client_secret required for Twitch app access token".to_string());
  };

  let response = client
    .post("https://id.twitch.tv/oauth2/token")
    .form(&form)
    .send()
    .await
    .map_err(|e| format!("token request failed: {e}"))?;

  if !response.status().is_success() {
    return Err(format!("Twitch token HTTP {}", response.status()));
  }

  let body: TwitchTokenBody = response
    .json()
    .await
    .map_err(|e| format!("token response parse failed: {e}"))?;
  Ok(body.access_token)
}

/// Normalize Twitch CDN URL to use HTTPS
/// Handles various URL formats from Twitch API responses
pub fn normalize_twitch_cdn_url(url: &Option<String>) -> Option<String> {
  let u = url.as_deref()?.trim();
  if u.is_empty() {
    return None;
  }
  if u.starts_with("//") {
    return Some(format!("https:{u}"));
  }
  if u.starts_with("https://") || u.starts_with("http://") {
    return Some(u.to_string());
  }
  None
}
