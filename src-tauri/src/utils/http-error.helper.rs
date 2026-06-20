//! Shared HTTP error handling and URL building utilities.
use reqwest::StatusCode;
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
pub fn handle_http_error(status: StatusCode, context: &str) -> String {
  match status {
    StatusCode::NOT_FOUND => format!("{} not found", context),
    StatusCode::TOO_MANY_REQUESTS => "Rate limit exceeded. Please try again later.".to_string(),
    StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
      format!("{} - Authentication may be required", status)
    }
    _ => {
      if status.is_server_error() {
        format!("Server error ({}): {}", status, context)
      } else {
        format!("HTTP error {}: {}", status, context)
      }
    }
  }
}
