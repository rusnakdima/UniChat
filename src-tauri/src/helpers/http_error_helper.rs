//! Shared HTTP error handling and URL building utilities.

use reqwest::StatusCode;
use std::fmt;

/// Build fallback URLs by prepending base to each path.
pub fn build_fallback_urls(base: &str, paths: &[&str]) -> Vec<String> {
  paths
    .iter()
    .map(|path| format!("{}{}", base, path))
    .collect()
}

/// Handle common HTTP error cases and return a user-friendly error message.
///
/// Maps status codes to appropriate error messages:
/// - 404: Resource not found
/// - 429: Rate limit exceeded
/// - 401/403: Authentication/authorization failure
/// - Other non-success: Generic API error
pub fn handle_http_error(status: StatusCode, context: &str) -> Result<String, String> {
  match status {
    StatusCode::NOT_FOUND => Err(format!("{} not found", context)),
    StatusCode::TOO_MANY_REQUESTS => {
      Err("Rate limit exceeded. Please try again later.".to_string())
    }
    StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
      Err(format!("{} - Authentication may be required", status))
    }
    _ => {
      if status.is_server_error() {
        Err(format!("Server error ({}): {}", status, context))
      } else {
        Err(format!("HTTP error {}: {}", status, context))
      }
    }
  }
}

impl fmt::Display for HttpError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      HttpError::NotFound(ctx) => write!(f, "{} not found", ctx),
      HttpError::RateLimited => write!(f, "Rate limit exceeded. Please try again later."),
      HttpError::Unauthorized => write!(f, "Authentication required"),
      HttpError::Forbidden => write!(f, "Access forbidden"),
      HttpError::ServerError(status) => write!(f, "Server error: {}", status),
      HttpError::Other(status, context) => write!(f, "HTTP {}: {}", status, context),
    }
  }
}

pub enum HttpError {
  NotFound(String),
  RateLimited,
  Unauthorized,
  Forbidden,
  ServerError(StatusCode),
  Other(StatusCode, String),
}
