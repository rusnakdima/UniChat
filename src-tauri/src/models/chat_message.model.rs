use serde::{Deserialize, Serialize};

use super::overlay_message_model::ChatMessageEmoteModel;
use super::platform_type_model::PlatformTypeModel;

/// Canonical chat message model used throughout the application
/// This is the single source of truth for chat messages
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageModel {
  /// Unique message identifier
  pub id: String,

  /// Platform source (twitch, kick, youtube)
  pub platform: PlatformTypeModel,

  /// Message author display name
  pub author: String,

  /// Sanitized message text
  pub text: String,

  /// ISO 8601 timestamp
  pub timestamp: String,

  /// Whether user is a supporter/subscriber
  pub is_supporter: bool,

  /// Source channel ID (platform-specific)
  pub source_channel_id: String,

  /// Source user ID (platform-specific)
  pub source_user_id: String,

  /// Author's avatar URL (optional)
  pub author_avatar_url: Option<String>,

  /// Message badges (e.g., "moderator", "subscriber")
  pub badges: Vec<String>,

  /// Parsed emotes in the message
  pub emotes: Option<Vec<ChatMessageEmoteModel>>,

  /// Raw payload from platform (for debugging/extensibility)
  pub raw_payload: Option<serde_json::Value>,

  /// Whether this message is deleted
  pub is_deleted: bool,

  /// ID of message being replied to (optional)
  pub reply_to_message_id: Option<String>,
}

impl ChatMessageModel {
  /// Create a new ChatMessageModel with minimal required fields
  pub fn new(
    id: String,
    platform: PlatformTypeModel,
    author: String,
    text: String,
    timestamp: String,
    source_channel_id: String,
    source_user_id: String,
  ) -> Self {
    Self {
      id,
      platform,
      author,
      text,
      timestamp,
      is_supporter: false,
      source_channel_id,
      source_user_id,
      author_avatar_url: None,
      badges: Vec::new(),
      emotes: None,
      raw_payload: None,
      is_deleted: false,
      reply_to_message_id: None,
    }
  }
}
