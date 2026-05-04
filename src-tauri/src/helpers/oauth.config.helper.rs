use crate::helpers::config_helper::AppConfig;
use crate::models::platform_type_model::PlatformTypeModel;

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
  config: &AppConfig,
) -> Result<OAuthProviderConfig, String> {
  match platform {
    PlatformTypeModel::Twitch => {
      let client_id = config
        .twitch_client_id
        .clone()
        .ok_or_else(|| {
          "Twitch OAuth not configured. Please set TWITCH_CLIENT_ID in your .env file or environment variables.".to_string()
        })?;
      let client_secret = config.twitch_client_secret.clone();

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
        redirect_uri: config.oauth_redirect_uri.clone(),
      })
    }
    PlatformTypeModel::Kick => {
      let client_id = config
        .kick_client_id
        .clone()
        .ok_or_else(|| {
          "Kick OAuth not configured. Please set KICK_CLIENT_ID in your .env file or environment variables.".to_string()
        })?;
      let client_secret = config.kick_client_secret.clone();

      Ok(OAuthProviderConfig {
        client_id,
        client_secret,
        authorize_url: config
          .kick_client_id
          .as_ref()
          .map(|_| "https://id.kick.com/oauth/authorize".to_string())
          .unwrap_or_else(|| "https://id.kick.com/oauth/authorize".to_string()),
        token_url: "https://id.kick.com/oauth/token".to_string(),
        userinfo_url: "https://api.kick.com/public/v1/users".to_string(),
        revoke_url: Some("https://id.kick.com/oauth/revoke".to_string()),
        scopes: vec![
          "user:read".to_string(),
          "chat:read".to_string(),
          "chat:write".to_string(),
          "moderation:chat_message:manage".to_string(),
        ],
        redirect_uri: config.oauth_redirect_uri.clone(),
      })
    }
    PlatformTypeModel::Youtube => {
      let client_id = config
        .youtube_client_id
        .clone()
        .ok_or_else(|| {
          "YouTube OAuth not configured. Please set YOUTUBE_CLIENT_ID in your .env file or environment variables.".to_string()
        })?;
      let client_secret = config.youtube_client_secret.clone();

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
        redirect_uri: config.oauth_redirect_uri.clone(),
      })
    }
  }
}
