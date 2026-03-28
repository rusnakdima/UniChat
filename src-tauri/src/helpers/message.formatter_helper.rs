use chrono::{DateTime, Utc};

use crate::models::chat_message_model::ChatMessageModel;
use crate::models::overlay_message_model::OverlayMessageModel;
use crate::models::provider_contract_model::PlatformTypeModel;

/// MessageFormatterHelper - Formatting utilities for chat messages
///
/// Provides canonical formatting functions for:
/// 1. Converting raw platform messages to unified ChatMessageModel
/// 2. Converting ChatMessageModel to overlay-optimized payload
/// 3. Platform-specific formatting helpers
///
/// Format a raw message into the unified ChatMessageModel
///
/// This is the canonical path for all platform connectors to create
/// normalized messages. Ensures consistent structure across all platforms.
///
/// # Arguments
/// * `platform` - Source platform (twitch, kick, youtube)
/// * `id` - Unique message ID
/// * `author` - Display name of message author
/// * `text` - Message text (should be pre-sanitized)
/// * `timestamp` - ISO 8601 timestamp
/// * `source_channel_id` - Channel ID from platform
/// * `source_user_id` - User ID from platform
///
/// # Returns
/// A ChatMessageModel builder with required fields set
pub fn format_for_unified_feed(
  platform: PlatformTypeModel,
  id: String,
  author: String,
  text: String,
  timestamp: String,
  source_channel_id: String,
  source_user_id: String,
) -> ChatMessageModel {
  ChatMessageModel::new(
    id,
    platform,
    author,
    text,
    timestamp,
    source_channel_id,
    source_user_id,
  )
}

/// Format a ChatMessageModel for overlay payload
///
/// Converts the full message model to a minimal overlay-optimized structure.
/// Strips unnecessary fields to reduce WebSocket payload size.
///
/// # Arguments
/// * `message` - The full ChatMessageModel
///
/// # Returns
/// An OverlayMessageModel with only overlay-relevant fields
pub fn format_for_overlay_payload(message: &ChatMessageModel) -> OverlayMessageModel {
  OverlayMessageModel {
    id: message.id.clone(),
    platform: match message.platform {
      PlatformTypeModel::Twitch => "twitch".to_string(),
      PlatformTypeModel::Kick => "kick".to_string(),
      PlatformTypeModel::Youtube => "youtube".to_string(),
    },
    author: message.author.clone(),
    text: message.text.clone(),
    timestamp: message.timestamp.clone(),
    is_supporter: message.is_supporter,
    source_channel_id: message.source_channel_id.clone(),
    author_avatar_url: message.author_avatar_url.clone(),
    channel_image_url: None, // Will be fetched by frontend based on source_channel_id
    emotes: message.emotes.clone(),
  }
}

/// Generate a unique message ID
///
/// # Arguments
/// * `platform` - Source platform
/// * `channel_id` - Channel ID
/// * `timestamp` - Message timestamp
///
/// # Returns
/// A unique ID in format: "{platform}_{channel_id}_{timestamp}"
pub fn generate_message_id(
  platform: &PlatformTypeModel,
  channel_id: &str,
  timestamp: &str,
) -> String {
  let platform_str = match platform {
    PlatformTypeModel::Twitch => "twitch",
    PlatformTypeModel::Kick => "kick",
    PlatformTypeModel::Youtube => "youtube",
  };

  format!("{}_{}_{}", platform_str, channel_id, timestamp)
}

/// Generate a unique message ID with current timestamp
pub fn generate_message_id_now(platform: &PlatformTypeModel, channel_id: &str) -> String {
  let now = Utc::now().to_rfc3339();
  generate_message_id(platform, channel_id, &now)
}

/// Parse platform-specific supporter badges
///
/// # Arguments
/// * `platform` - Source platform
/// * `badges` - List of badge names from platform
///
/// # Returns
/// true if any badge indicates supporter status
pub fn parse_supporter_status(platform: &PlatformTypeModel, badges: &[String]) -> bool {
  let supporter_badges = match platform {
    PlatformTypeModel::Twitch => {
      vec![
        "subscriber",
        "founder",
        "vip",
        "moderator",
        "broadcaster",
        "admin",
        "global_mod",
        "staff",
      ]
    }
    PlatformTypeModel::Kick => {
      vec!["subscriber", "vip", "moderator", "broadcaster"]
    }
    PlatformTypeModel::Youtube => {
      vec!["member", "moderator", "owner", "verified"]
    }
  };

  badges.iter().any(|badge| {
    let badge_lower = badge.to_lowercase();
    supporter_badges.iter().any(|s| badge_lower.contains(s))
  })
}

/// Format timestamp to ISO 8601
///
/// # Arguments
/// * `timestamp` - Any timestamp string
///
/// # Returns
/// ISO 8601 formatted timestamp or current time if parsing fails
pub fn format_timestamp_iso(timestamp: &str) -> String {
  DateTime::parse_from_rfc3339(timestamp)
    .unwrap_or_else(|_| Utc::now().into())
    .to_rfc3339()
}

/// Format timestamp for display
///
/// # Arguments
/// * `timestamp` - ISO 8601 timestamp
/// * `format` - Desired output format (e.g., "%H:%M:%S")
///
/// # Returns
/// Formatted timestamp string
pub fn format_timestamp_display(timestamp: &str, format: &str) -> String {
  DateTime::parse_from_rfc3339(timestamp)
    .unwrap_or_else(|_| Utc::now().into())
    .format(format)
    .to_string()
}

/// Create a system message (for errors, notifications, etc.)
///
/// # Arguments
/// * `text` - System message text
/// * `channel_id` - Associated channel ID
///
/// # Returns
/// A ChatMessageModel marked as a system message
pub fn create_system_message(text: String, channel_id: &str) -> ChatMessageModel {
  let now = Utc::now().to_rfc3339();

  ChatMessageModel::new(
    format!("system_{}", now),
    PlatformTypeModel::Twitch, // Default, can be overridden
    "System".to_string(),
    text,
    now,
    channel_id.to_string(),
    "system".to_string(),
  )
  .with_badges(vec!["system".to_string()])
}

/// Create a test message for development/testing
///
/// # Arguments
/// * `platform` - Platform to simulate
/// * `channel_id` - Channel ID
///
/// # Returns
/// A ChatMessageModel with test data
pub fn create_test_message(platform: PlatformTypeModel, channel_id: &str) -> ChatMessageModel {
  let now = Utc::now().to_rfc3339();

  let (author, text, badges) = match platform {
    PlatformTypeModel::Twitch => (
      "TwitchUser123".to_string(),
      "Hello from Twitch! PogChamp".to_string(),
      vec!["subscriber".to_string()],
    ),
    PlatformTypeModel::Kick => (
      "KickFan456".to_string(),
      "Kick chat is live!".to_string(),
      vec!["vip".to_string()],
    ),
    PlatformTypeModel::Youtube => (
      "YouTubeMember".to_string(),
      "YouTube super chat!".to_string(),
      vec!["member".to_string()],
    ),
  };

  ChatMessageModel::new(
    generate_message_id_now(&platform, channel_id),
    platform,
    author,
    text,
    now,
    channel_id.to_string(),
    "test_user_id".to_string(),
  )
  .with_supporter(true)
  .with_badges(badges)
}
