use crate::models::provider_contract_model::PlatformTypeModel;
use std::collections::HashMap;

#[derive(Clone)]
pub struct OAuthProviderConfig {
  pub client_id: String,
  pub client_secret: Option<String>,
  pub authorize_url: String,
  pub token_url: String,
  pub userinfo_url: String,
  pub revoke_url: Option<String>,
  pub scopes: Vec<String>,
  pub redirect_uri: String,
}

pub fn getOAuthProviderConfig(platform: &PlatformTypeModel) -> Result<OAuthProviderConfig, String> {
  match platform {
    PlatformTypeModel::Twitch => Ok(OAuthProviderConfig {
      client_id: readRequired("TWITCH_CLIENT_ID")?,
      client_secret: readValue("TWITCH_CLIENT_SECRET"),
      authorize_url: "https://id.twitch.tv/oauth2/authorize".to_string(),
      token_url: "https://id.twitch.tv/oauth2/token".to_string(),
      userinfo_url: "https://api.twitch.tv/helix/users".to_string(),
      revoke_url: Some("https://id.twitch.tv/oauth2/revoke".to_string()),
      scopes: vec![
        "chat:read".to_string(),
        "chat:edit".to_string(),
        "moderator:manage:banned_users".to_string(),
      ],
      redirect_uri: readOrDefault(
        "UNICHAT_OAUTH_REDIRECT_URI",
        "http://localhost:3456/callback".to_string(),
      ),
    }),
    PlatformTypeModel::Kick => Ok(OAuthProviderConfig {
      client_id: readRequired("KICK_CLIENT_ID")?,
      client_secret: readValue("KICK_CLIENT_SECRET"),
      authorize_url: readOrDefault(
        "KICK_AUTHORIZE_URL",
        "https://id.kick.com/oauth/authorize".to_string(),
      ),
      token_url: readOrDefault(
        "KICK_TOKEN_URL",
        "https://id.kick.com/oauth/token".to_string(),
      ),
      userinfo_url: readOrDefault(
        "KICK_USERINFO_URL",
        "https://api.kick.com/public/v1/users".to_string(),
      ),
      revoke_url: Some(readOrDefault(
        "KICK_REVOKE_URL",
        "https://id.kick.com/oauth/revoke".to_string(),
      )),
      scopes: vec![readOrDefault(
        "KICK_SCOPES",
        "chat:read chat:write".to_string(),
      )],
      redirect_uri: readOrDefault(
        "UNICHAT_OAUTH_REDIRECT_URI",
        "http://localhost:3456/callback".to_string(),
      ),
    }),
    PlatformTypeModel::Youtube => Ok(OAuthProviderConfig {
      client_id: readRequired("YOUTUBE_CLIENT_ID")?,
      client_secret: readValue("YOUTUBE_CLIENT_SECRET"),
      authorize_url: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
      token_url: "https://oauth2.googleapis.com/token".to_string(),
      userinfo_url: "https://www.googleapis.com/oauth2/v2/userinfo".to_string(),
      revoke_url: Some("https://oauth2.googleapis.com/revoke".to_string()),
      scopes: vec![
        "https://www.googleapis.com/auth/youtube.readonly".to_string(),
        "https://www.googleapis.com/auth/youtube.force-ssl".to_string(),
      ],
      redirect_uri: readOrDefault(
        "UNICHAT_OAUTH_REDIRECT_URI",
        "http://localhost:3456/callback".to_string(),
      ),
    }),
  }
}

fn readRequired(key: &str) -> Result<String, String> {
  readValue(key).ok_or_else(|| format!("{key} not set"))
}

fn readOrDefault(key: &str, defaultValue: String) -> String {
  readValue(key).unwrap_or(defaultValue)
}

fn readValue(key: &str) -> Option<String> {
  if let Ok(value) = std::env::var(key) {
    return Some(value);
  }

  let dotenvPath = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
  let dotenvContent = std::fs::read_to_string(dotenvPath).ok()?;
  parseDotenv(&dotenvContent).get(key).cloned()
}

fn parseDotenv(dotenvContent: &str) -> HashMap<String, String> {
  dotenvContent
    .lines()
    .filter_map(|line| {
      let trimmed = line.trim();
      if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
      }

      let mut parts = trimmed.splitn(2, '=');
      let key = parts.next()?.trim().to_string();
      let rawValue = parts.next()?.trim();
      let value = rawValue.trim_matches('"').trim_matches('\'').to_string();
      Some((key, value))
    })
    .collect()
}
