//! Application Configuration Helper
//! Centralized config loading from environment variables and .env files
//! Inspired by TaskFlow's approach with runtime fallback support
use std::sync::Arc;
use tauri_shared::AppError;
#[derive(Debug, Clone)]
pub struct AppConfig {
  // App metadata
  pub name: String,
  pub version: String,
  // OAuth settings
  pub oauth_redirect_uri: String,
  // Platform credentials (all Optional for graceful degradation)
  pub twitch_client_id: Option<String>,
  pub twitch_client_secret: Option<String>,
  pub kick_client_id: Option<String>,
  pub kick_client_secret: Option<String>,
  pub youtube_client_id: Option<String>,
  pub youtube_client_secret: Option<String>,
  pub youtube_data_api_key: Option<String>,
  // Feature flags
  pub enable_debug_logging: bool,
}
impl Default for AppConfig {
  fn default() -> Self {
    Self::new()
  }
}
impl AppConfig {
  pub fn new() -> Self {
    tauri_shared::env::init_env();
    AppConfig {
      name: "UniChat".to_string(),
      version: env!("CARGO_PKG_VERSION").to_string(),
      oauth_redirect_uri: std::env::var("UNICHAT_OAUTH_REDIRECT_URI").unwrap_or_else(|_| {
        format!(
          "http://localhost:{}/callback",
          crate::constants::CALLBACK_PORT
        )
      }),
      twitch_client_id: std::env::var("TWITCH_CLIENT_ID").ok(),
      twitch_client_secret: std::env::var("TWITCH_CLIENT_SECRET").ok(),
      kick_client_id: std::env::var("KICK_CLIENT_ID").ok(),
      kick_client_secret: std::env::var("KICK_CLIENT_SECRET").ok(),
      youtube_client_id: std::env::var("YOUTUBE_CLIENT_ID").ok(),
      youtube_client_secret: std::env::var("YOUTUBE_CLIENT_SECRET").ok(),
      youtube_data_api_key: std::env::var("YOUTUBE_DATA_API_KEY").ok(),
      enable_debug_logging: std::env::var("UNICHAT_DEBUG")
        .map(|s| s.to_lowercase() == "true")
        .unwrap_or(false),
    }
  }
  pub fn validate(&self) -> Result<(), AppError> {
    let has_twitch = self.twitch_client_id.is_some() && self.twitch_client_secret.is_some();
    let has_kick = self.kick_client_id.is_some() && self.kick_client_secret.is_some();
    let has_youtube = self.youtube_client_id.is_some() && self.youtube_client_secret.is_some();
    if !has_twitch && !has_kick && !has_youtube {
      return Err(AppError::ValidationError(
        "At least one OAuth provider must be configured. Please set credentials for Twitch, Kick, or YouTube.".to_string()
      ));
    }
    Ok(())
  }
}
/// Type alias for shared config
pub type SharedConfig = Arc<AppConfig>;
