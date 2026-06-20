//! Custom error types for the application
//! Provides type-safe error handling with proper context
use thiserror::Error;
/// Main application error type
#[derive(Debug, Error)]
pub enum AppError {
  #[error("Network error: {0}")]
  Network(#[from] reqwest::Error),
  #[error("JSON parsing error: {0}")]
  Json(#[from] serde_json::Error),
  #[error("IO error: {0}")]
  Io(#[from] std::io::Error),
  #[error("URL parsing error: {0}")]
  Url(#[from] url::ParseError),
  #[error("Validation error: {0}")]
  Validation(String),
  #[error("Not found: {0}")]
  NotFound(String),
  #[error("Unauthorized: {0}")]
  Unauthorized(String),
  #[error("Rate limit exceeded: {0}")]
  RateLimit(String),
  #[error("Configuration error: {0}")]
  Config(String),
  #[error("Platform error ({platform}): {message}")]
  Platform { platform: String, message: String },
  #[error("Internal error: {0}")]
  Internal(String),
}
/// Result type alias for AppError
pub type AppResult<T> = Result<T, AppError>;
impl AppError {
  /// Create a validation error
  pub fn validation(msg: impl Into<String>) -> Self {
    Self::Validation(msg.into())
  }
  /// Create a not found error
  pub fn not_found(msg: impl Into<String>) -> Self {
    Self::NotFound(msg.into())
  }
  /// Create an unauthorized error
  pub fn unauthorized(msg: impl Into<String>) -> Self {
    Self::Unauthorized(msg.into())
  }
  /// Create a rate limit error
  pub fn rate_limit(msg: impl Into<String>) -> Self {
    Self::RateLimit(msg.into())
  }
  /// Create a platform-specific error
  pub fn platform(platform: impl Into<String>, message: impl Into<String>) -> Self {
    Self::Platform {
      platform: platform.into(),
      message: message.into(),
    }
  }
  /// Create an internal error
  pub fn internal(msg: impl Into<String>) -> Self {
    Self::Internal(msg.into())
  }
  /// Convert to a string message (for Tauri commands)
  pub fn to_message(&self) -> String {
    self.to_string()
  }
}
pub type OAuthResult<T> = Result<T, AppError>;
