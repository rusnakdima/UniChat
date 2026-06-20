//! Input validation utilities
//! Provides validation functions for user inputs to prevent security issues
use thiserror::Error;
#[derive(Debug, Error)]
pub enum ValidationError {
  #[error("Input cannot be empty")]
  Empty,
  #[error("Input exceeds maximum length of {max} characters")]
  TooLong { max: usize },
  #[error("Input contains invalid characters")]
  InvalidCharacters,
  #[error("Input must be a valid {field}")]
  InvalidFormat { field: String },
}
pub type ValidationResult<T> = Result<T, ValidationError>;
/// Validate a channel slug (alphanumeric + underscore only)
/// Used for Kick, Twitch channel names
pub fn validate_channel_slug(slug: &str) -> ValidationResult<()> {
  if slug.is_empty() {
    return Err(ValidationError::Empty);
  }
  if slug.len() > 50 {
    return Err(ValidationError::TooLong { max: 50 });
  }
  if !slug.chars().all(|c| c.is_alphanumeric() || c == '_') {
    return Err(ValidationError::InvalidCharacters);
  }
  Ok(())
}
/// Validate a message ID (alphanumeric + dash only)
pub fn validate_message_id(message_id: &str) -> ValidationResult<()> {
  if message_id.is_empty() {
    return Err(ValidationError::Empty);
  }
  if message_id.len() > 100 {
    return Err(ValidationError::TooLong { max: 100 });
  }
  if !message_id.chars().all(|c| c.is_alphanumeric() || c == '-') {
    return Err(ValidationError::InvalidCharacters);
  }
  Ok(())
}
/// Validate OAuth token format (non-empty, reasonable length)
pub fn validate_oauth_token(token: &str) -> ValidationResult<()> {
  if token.is_empty() {
    return Err(ValidationError::Empty);
  }
  // OAuth tokens are typically long alphanumeric strings
  if token.len() < 10 || token.len() > 1000 {
    return Err(ValidationError::InvalidFormat {
      field: "OAuth token".to_string(),
    });
  }
  Ok(())
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn test_valid_channel_slug() {
    assert!(validate_channel_slug("valid_channel123").is_ok());
    assert!(validate_channel_slug("test").is_ok());
    assert!(validate_channel_slug("a").is_ok());
  }
  #[test]
  fn test_invalid_channel_slug() {
    assert!(validate_channel_slug("").is_err());
    assert!(validate_channel_slug("invalid channel").is_err());
    assert!(validate_channel_slug("invalid<script>").is_err());
    assert!(validate_channel_slug(&"a".repeat(51)).is_err());
  }
}
