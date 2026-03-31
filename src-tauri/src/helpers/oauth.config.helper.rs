use crate::models::platform_type_model::PlatformTypeModel;
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

pub fn get_oauth_provider_config(
  platform: &PlatformTypeModel,
) -> Result<OAuthProviderConfig, String> {
  match platform {
    PlatformTypeModel::Twitch => {
      let client_id = read_required("TWITCH_CLIENT_ID")
        .map_err(|e| format!("Twitch OAuth not configured: {e}. Please set TWITCH_CLIENT_ID in your .env file or environment variables."))?;
      let client_secret = read_value("TWITCH_CLIENT_SECRET");

      Ok(OAuthProviderConfig {
        client_id,
        client_secret,
        authorize_url: "https://id.twitch.tv/oauth2/authorize".to_string(),
        token_url: "https://id.twitch.tv/oauth2/token".to_string(),
        userinfo_url: "https://api.twitch.tv/helix/users".to_string(),
        revoke_url: Some("https://id.twitch.tv/oauth2/revoke".to_string()),
        scopes: vec![
          "chat:read".to_string(),
          "chat:edit".to_string(),
          "moderator:manage:banned_users".to_string(),
        ],
        redirect_uri: read_or_default(
          "UNICHAT_OAUTH_REDIRECT_URI",
          "http://localhost:3456/callback".to_string(),
        ),
      })
    }
    PlatformTypeModel::Kick => {
      let client_id = read_required("KICK_CLIENT_ID")
        .map_err(|e| format!("Kick OAuth not configured: {e}. Please set KICK_CLIENT_ID in your .env file or environment variables."))?;
      let client_secret = read_value("KICK_CLIENT_SECRET");

      Ok(OAuthProviderConfig {
        client_id,
        client_secret,
        authorize_url: read_or_default(
          "KICK_AUTHORIZE_URL",
          "https://id.kick.com/oauth/authorize".to_string(),
        ),
        token_url: read_or_default(
          "KICK_TOKEN_URL",
          "https://id.kick.com/oauth/token".to_string(),
        ),
        userinfo_url: read_or_default(
          "KICK_USERINFO_URL",
          "https://api.kick.com/public/v1/users".to_string(),
        ),
        revoke_url: Some(read_or_default(
          "KICK_REVOKE_URL",
          "https://id.kick.com/oauth/revoke".to_string(),
        )),
        scopes: vec![read_or_default(
          "KICK_SCOPES",
          "chat:read chat:write".to_string(),
        )],
        redirect_uri: read_or_default(
          "UNICHAT_OAUTH_REDIRECT_URI",
          "http://localhost:3456/callback".to_string(),
        ),
      })
    }
    PlatformTypeModel::Youtube => {
      let client_id = read_required("YOUTUBE_CLIENT_ID")
        .map_err(|e| format!("YouTube OAuth not configured: {e}. Please set YOUTUBE_CLIENT_ID in your .env file or environment variables."))?;
      let client_secret = read_value("YOUTUBE_CLIENT_SECRET");

      Ok(OAuthProviderConfig {
        client_id,
        client_secret,
        authorize_url: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
        token_url: "https://oauth2.googleapis.com/token".to_string(),
        userinfo_url: "https://www.googleapis.com/oauth2/v2/userinfo".to_string(),
        revoke_url: Some("https://oauth2.googleapis.com/revoke".to_string()),
        scopes: vec![
          "https://www.googleapis.com/auth/youtube.readonly".to_string(),
          "https://www.googleapis.com/auth/youtube.force-ssl".to_string(),
        ],
        redirect_uri: read_or_default(
          "UNICHAT_OAUTH_REDIRECT_URI",
          "http://localhost:3456/callback".to_string(),
        ),
      })
    }
  }
}

fn read_required(key: &str) -> Result<String, String> {
  read_value(key).ok_or_else(|| format!("{key} not set"))
}

fn read_or_default(key: &str, default_value: String) -> String {
  read_value(key).unwrap_or(default_value)
}

fn read_value(key: &str) -> Option<String> {
  if let Ok(value) = std::env::var(key) {
    return Some(value);
  }

  let dotenv_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
  let dotenv_content = std::fs::read_to_string(dotenv_path).ok()?;
  parse_dotenv(&dotenv_content).get(key).cloned()
}

fn parse_dotenv(dotenv_content: &str) -> HashMap<String, String> {
  dotenv_content
    .lines()
    .filter_map(|line| {
      let trimmed = line.trim();
      if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
      }

      let mut parts = trimmed.splitn(2, '=');
      let key = parts.next()?.trim().to_string();
      let raw_value = parts.next()?.trim();
      let value = raw_value.trim_matches('"').trim_matches('\'').to_string();
      Some((key, value))
    })
    .collect()
}
