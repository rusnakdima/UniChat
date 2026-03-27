use serde::{Deserialize, Serialize};

use super::overlay_message_model::ChatMessageEmoteModel;
use super::provider_contract_model::PlatformTypeModel;

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

  /// Builder-style method to set supporter status
  pub fn with_supporter(mut self, is_supporter: bool) -> Self {
    self.is_supporter = is_supporter;
    self
  }

  /// Builder-style method to set avatar URL
  pub fn with_avatar(mut self, url: Option<String>) -> Self {
    self.author_avatar_url = url;
    self
  }

  /// Builder-style method to set badges
  pub fn with_badges(mut self, badges: Vec<String>) -> Self {
    self.badges = badges;
    self
  }

  /// Builder-style method to set emotes
  pub fn with_emotes(mut self, emotes: Option<Vec<ChatMessageEmoteModel>>) -> Self {
    self.emotes = emotes;
    self
  }

  /// Builder-style method to set raw payload
  pub fn with_raw_payload(mut self, payload: Option<serde_json::Value>) -> Self {
    self.raw_payload = payload;
    self
  }

  /// Check if message has emotes
  pub fn has_emotes(&self) -> bool {
    self.emotes.as_ref().map_or(false, |e| !e.is_empty())
  }

  /// Get emote count
  pub fn emote_count(&self) -> usize {
    self.emotes.as_ref().map_or(0, |e| e.len())
  }

  /// Check if message has a specific badge
  pub fn has_badge(&self, badge: &str) -> bool {
    self.badges.iter().any(|b| b.to_lowercase() == badge.to_lowercase())
  }

  /// Check if message is from a specific platform
  pub fn is_from_platform(&self, platform: PlatformTypeModel) -> bool {
    match (&self.platform, &platform) {
      (PlatformTypeModel::Twitch, PlatformTypeModel::Twitch) => true,
      (PlatformTypeModel::Kick, PlatformTypeModel::Kick) => true,
      (PlatformTypeModel::Youtube, PlatformTypeModel::Youtube) => true,
      _ => false,
    }
  }
}
