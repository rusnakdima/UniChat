/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
/* nosql_orm */
use nosql_orm::{Model, Validate};
#[derive(Debug, Clone, Serialize, Deserialize, Model, Validate)]
#[table_name("chat_messages")]
#[soft_delete]
#[timestamp]
#[index("platform", 1)]
#[index("source_channel_id", 1)]
#[index("source_user_id", 1)]
#[index("created_at", -1)]
pub struct ChatMessageEntity {
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
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ChatMessageCreateModel {
  #[validate(required)]
  pub platform: String,
  #[validate(required)]
  pub source_message_id: String,
  #[validate(required)]
  pub source_channel_id: String,
  #[validate(required)]
  pub source_user_id: String,
  #[validate(required)]
  pub author: String,
  #[validate(required)]
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
impl From<ChatMessageCreateModel> for ChatMessageEntity {
  fn from(create: ChatMessageCreateModel) -> Self {
    ChatMessageEntity {
      id: None,
      platform: create.platform,
      source_message_id: create.source_message_id,
      source_channel_id: create.source_channel_id,
      source_user_id: create.source_user_id,
      author: create.author,
      text: create.text,
      badges: create.badges.unwrap_or_default(),
      is_supporter: create.is_supporter.unwrap_or(false),
      is_outgoing: create.is_outgoing.unwrap_or(false),
      is_deleted: false,
      can_render_in_overlay: create.can_render_in_overlay.unwrap_or(true),
      reply_to_message_id: create.reply_to_message_id,
      message_type: create.message_type,
      message_type_reason: None,
      sequence_number: create.sequence_number,
      received_at: Some(chrono::Utc::now().timestamp_millis()),
      created_at: None,
      updated_at: None,
      deleted_at: None,
    }
  }
}
