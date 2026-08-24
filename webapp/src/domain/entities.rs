//! Domain Entities
//!
//! Core business entities for UniChat.
//! These entities represent chat messages, channels, accounts, emotes, and preferences.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ============================================================================
// Chat Message Entity
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatMessage {
    pub id: Option<String>,
    pub platform: String,
    pub source_message_id: String,
    pub source_channel_id: String,
    pub source_user_id: String,
    pub author: String,
    pub text: String,
    #[serde(default)]
    pub badges: Vec<String>,
    #[serde(default)]
    pub is_supporter: bool,
    #[serde(default)]
    pub is_outgoing: bool,
    #[serde(default)]
    pub is_deleted: bool,
    #[serde(default)]
    pub can_render_in_overlay: bool,
    pub reply_to_message_id: Option<String>,
    #[serde(default)]
    pub message_type: Option<String>,
    #[serde(default)]
    pub message_type_reason: Option<String>,
    #[serde(default)]
    pub sequence_number: Option<i64>,
    #[serde(default)]
    pub received_at: Option<i64>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Default for ChatMessage {
    fn default() -> Self {
        Self {
            id: None,
            platform: String::new(),
            source_message_id: String::new(),
            source_channel_id: String::new(),
            source_user_id: String::new(),
            author: String::new(),
            text: String::new(),
            badges: vec![],
            is_supporter: false,
            is_outgoing: false,
            is_deleted: false,
            can_render_in_overlay: true,
            reply_to_message_id: None,
            message_type: None,
            message_type_reason: None,
            sequence_number: None,
            received_at: Some(chrono::Utc::now().timestamp_millis()),
            created_at: None,
            updated_at: None,
            deleted_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatMessageCreate {
    pub platform: String,
    pub source_message_id: String,
    pub source_channel_id: String,
    pub source_user_id: String,
    pub author: String,
    pub text: String,
    #[serde(default)]
    pub badges: Option<Vec<String>>,
    #[serde(default)]
    pub is_supporter: Option<bool>,
    #[serde(default)]
    pub is_outgoing: Option<bool>,
    #[serde(default)]
    pub can_render_in_overlay: Option<bool>,
    pub reply_to_message_id: Option<String>,
    #[serde(default)]
    pub message_type: Option<String>,
    #[serde(default)]
    pub sequence_number: Option<i64>,
}

// ============================================================================
// Chat Channel Entity
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatChannel {
    pub id: Option<String>,
    pub platform: String,
    pub channel_id: String,
    pub channel_name: String,
    #[serde(default)]
    pub channel_image_url: Option<String>,
    #[serde(default)]
    pub is_authorized: bool,
    pub account_id: Option<String>,
    #[serde(default)]
    pub account_capabilities: Option<serde_json::Value>,
    #[serde(default)]
    pub is_visible: bool,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Default for ChatChannel {
    fn default() -> Self {
        Self {
            id: None,
            platform: String::new(),
            channel_id: String::new(),
            channel_name: String::new(),
            channel_image_url: None,
            is_authorized: false,
            account_id: None,
            account_capabilities: None,
            is_visible: true,
            created_at: None,
            updated_at: None,
            deleted_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatChannelCreate {
    pub platform: String,
    pub channel_id: String,
    pub channel_name: String,
    #[serde(default)]
    pub channel_image_url: Option<String>,
    #[serde(default)]
    pub is_authorized: Option<bool>,
    pub account_id: Option<String>,
    #[serde(default)]
    pub account_capabilities: Option<serde_json::Value>,
    #[serde(default)]
    pub is_visible: Option<bool>,
}

// ============================================================================
// Chat Account Entity
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatAccount {
    pub id: Option<String>,
    pub platform: String,
    pub username: String,
    pub user_id: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub auth_status: String,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub token_expires_at: Option<String>,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Default for ChatAccount {
    fn default() -> Self {
        Self {
            id: None,
            platform: String::new(),
            username: String::new(),
            user_id: String::new(),
            avatar_url: None,
            auth_status: "unauthorized".to_string(),
            access_token: None,
            refresh_token: None,
            token_expires_at: None,
            created_at: None,
            updated_at: None,
            deleted_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatAccountCreate {
    pub platform: String,
    pub username: String,
    pub user_id: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub auth_status: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<String>,
}

// ============================================================================
// Custom Emote Entity
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CustomEmote {
    pub id: Option<String>,
    pub platform: String,
    pub channel_id: Option<String>,
    pub emote_code: String,
    pub emote_url: String,
    #[serde(default)]
    pub emote_type: String,
    #[serde(default)]
    pub created_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub updated_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted_at: Option<DateTime<Utc>>,
}

impl Default for CustomEmote {
    fn default() -> Self {
        Self {
            id: None,
            platform: String::new(),
            channel_id: None,
            emote_code: String::new(),
            emote_url: String::new(),
            emote_type: "custom".to_string(),
            created_at: None,
            updated_at: None,
            deleted_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CustomEmoteCreate {
    pub platform: String,
    pub channel_id: Option<String>,
    pub emote_code: String,
    pub emote_url: String,
    #[serde(default)]
    pub emote_type: Option<String>,
}

// ============================================================================
// Dashboard Preferences Entity
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardPreferences {
    pub id: Option<String>,
    pub feed_mode: String,
    pub density_mode: String,
    #[serde(default)]
    pub auto_scroll: bool,
    #[serde(default)]
    pub split_layout: serde_json::Value,
    #[serde(default)]
    pub mixed_enabled_channel_ids: Vec<String>,
}

impl Default for DashboardPreferences {
    fn default() -> Self {
        Self {
            id: None,
            feed_mode: "mixed".to_string(),
            density_mode: "comfortable".to_string(),
            auto_scroll: true,
            split_layout: serde_json::json!({
                "orderedPlatforms": ["twitch", "kick", "youtube"],
                "hiddenPlatforms": [],
                "columnWidths": {
                    "twitch": 33,
                    "kick": 33,
                    "youtube": 34
                }
            }),
            mixed_enabled_channel_ids: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardPreferencesUpdate {
    #[serde(default)]
    pub feed_mode: Option<String>,
    #[serde(default)]
    pub density_mode: Option<String>,
    #[serde(default)]
    pub auto_scroll: Option<bool>,
    #[serde(default)]
    pub split_layout: Option<serde_json::Value>,
    #[serde(default)]
    pub mixed_enabled_channel_ids: Option<Vec<String>>,
}

// ============================================================================
// Platform Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Platform {
    Twitch,
    Kick,
    Youtube,
}

// ============================================================================
// IRC Message Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct IrcMessage {
    pub id: String,
    pub platform: String,
    pub channel_id: String,
    pub channel_name: String,
    pub author: String,
    pub author_id: String,
    pub text: String,
    pub timestamp: i64,
    pub badges: Vec<Badge>,
    pub color: String,
    pub emotes: Vec<Emote>,
    pub is_mod: bool,
    pub is_subscriber: bool,
    pub is_highlighted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Badge {
    pub set_id: String,
    pub id: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Emote {
    pub id: String,
    pub code: String,
    pub urls: Vec<String>,
}

// ============================================================================
// OAuth Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AuthStatus {
    pub platform: Platform,
    pub is_connected: bool,
    pub username: Option<String>,
    pub expires_at: Option<String>,
}

// ============================================================================
// Storage Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    pub key: String,
    pub value: serde_json::Value,
}

// ============================================================================
// Overlay Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OverlayConfig {
    pub port: u16,
    pub enabled: bool,
    pub sources: Vec<OverlaySource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OverlaySource {
    pub id: String,
    pub channel_id: String,
    pub platform: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct OverlayMessage {
    pub id: String,
    pub platform: String,
    pub channel_id: String,
    pub author: String,
    pub text: String,
    pub timestamp: i64,
    pub color: String,
}

// ============================================================================
// Update Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UpdateInfo {
    pub version: String,
    pub release_date: String,
    pub download_url: String,
    pub release_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VersionInfo {
    pub current: String,
    pub latest: Option<String>,
}

// ============================================================================
// Platform-Specific Info Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KickChatroomInfo {
    pub chatroom_id: String,
    pub channel_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KickUserInfo {
    pub user_id: String,
    pub username: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeChannelInfo {
    pub channel_id: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
}
