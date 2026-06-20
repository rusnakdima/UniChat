//! Application Configuration Helper
//! Centralized config loading from environment variables and .env files
//! Inspired by TaskFlow's approach with runtime fallback support
use crate::utils::errors::AppError;
use std::collections::HashMap;
use std::sync::Arc;
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
    let env_vars = Self::load_env_vars();
    AppConfig {
      name: "UniChat".to_string(),
      version: env!("CARGO_PKG_VERSION").to_string(),
      oauth_redirect_uri: env_vars
        .get("UNICHAT_OAUTH_REDIRECT_URI")
        .cloned()
        .unwrap_or_else(|| {
          format!(
            "http://localhost:{}/callback",
            crate::constants::CALLBACK_PORT
          )
        }),
      twitch_client_id: env_vars.get("TWITCH_CLIENT_ID").cloned(),
      twitch_client_secret: env_vars.get("TWITCH_CLIENT_SECRET").cloned(),
      kick_client_id: env_vars.get("KICK_CLIENT_ID").cloned(),
      kick_client_secret: env_vars.get("KICK_CLIENT_SECRET").cloned(),
      youtube_client_id: env_vars.get("YOUTUBE_CLIENT_ID").cloned(),
      youtube_client_secret: env_vars.get("YOUTUBE_CLIENT_SECRET").cloned(),
      youtube_data_api_key: env_vars.get("YOUTUBE_DATA_API_KEY").cloned(),
      enable_debug_logging: env_vars
        .get("UNICHAT_DEBUG")
        .map(|s| s.to_lowercase() == "true")
        .unwrap_or(false),
    }
  }
  /// Load environment variables from multiple sources
  fn load_env_vars() -> HashMap<String, String> {
    let mut env_vars = HashMap::new();
    for (key, value) in std::env::vars() {
      if key.contains("TWITCH")
        || key.contains("KICK")
        || key.contains("YOUTUBE")
        || key.contains("UNICHAT")
      {
        env_vars.insert(key, value);
      }
    }
    let embedded_content = include_str!("../../.env");
    if !embedded_content.trim().is_empty() {
      for (key, value) in Self::parse_dotenv(embedded_content) {
        env_vars.entry(key).or_insert(value);
      }
    }
    let paths = Self::collect_env_paths();
    for path in paths {
      if let Ok(content) = std::fs::read_to_string(&path) {
        for (key, value) in Self::parse_dotenv(&content) {
          env_vars.entry(key).or_insert(value);
        }
        break;
      }
    }
    env_vars
  }
  /// Collect possible .env file locations
  fn collect_env_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    // 1. Next to executable
    if let Ok(exe_path) = std::env::current_exe() {
      if let Some(exe_dir) = exe_path.parent() {
        paths.push(exe_dir.join(".env"));
      }
    }
    // 2. Current working directory
    if let Ok(cwd) = std::env::current_dir() {
      paths.push(cwd.join(".env"));
    }
    // 3. Home directory with custom name
    if let Ok(home) = std::env::var("HOME") {
      paths.push(std::path::Path::new(&home).join(".unichat.env"));
    }
    // 4. Windows AppData
    #[cfg(target_os = "windows")]
    if let Ok(app_data) = std::env::var("APPDATA") {
      paths.push(std::path::Path::new(&app_data).join("UniChat").join(".env"));
    }
    // 5. Tauri resource directory (if available at runtime)
    // Note: This requires tauri::Manager which isn't available in helper
    // Can be loaded separately in lib.rs setup
    paths
  }
  /// Parse .env file content
  pub fn parse_dotenv(content: &str) -> HashMap<String, String> {
    content
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
  pub fn validate(&self) -> Result<(), AppError> {
    let has_twitch = self.twitch_client_id.is_some() && self.twitch_client_secret.is_some();
    let has_kick = self.kick_client_id.is_some() && self.kick_client_secret.is_some();
    let has_youtube = self.youtube_client_id.is_some() && self.youtube_client_secret.is_some();
    if !has_twitch && !has_kick && !has_youtube {
      return Err(AppError::Config(
        "At least one OAuth provider must be configured. Please set credentials for Twitch, Kick, or YouTube.".to_string()
      ));
    }
    Ok(())
  }
}
/// Type alias for shared config
pub type SharedConfig = Arc<AppConfig>;
