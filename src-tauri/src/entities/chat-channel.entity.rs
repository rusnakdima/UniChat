/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
/* nosql_orm */
use nosql_orm::{Model, Validate};
#[derive(Debug, Clone, Serialize, Deserialize, Model, Validate)]
#[table_name("chat_channels")]
#[soft_delete]
#[timestamp]
#[index("platform", 1)]
#[index("channel_id", 1)]
#[index("account_id", 1)]
pub struct ChatChannelEntity {
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
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ChatChannelCreateModel {
  #[validate(required)]
  pub platform: String,
  #[validate(required)]
  pub channel_id: String,
  #[validate(required)]
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
impl From<ChatChannelCreateModel> for ChatChannelEntity {
  fn from(create: ChatChannelCreateModel) -> Self {
    ChatChannelEntity {
      id: None,
      platform: create.platform,
      channel_id: create.channel_id,
      channel_name: create.channel_name,
      channel_image_url: create.channel_image_url,
      is_authorized: create.is_authorized.unwrap_or(false),
      account_id: create.account_id,
      account_capabilities: create.account_capabilities,
      is_visible: create.is_visible.unwrap_or(true),
      created_at: None,
      updated_at: None,
      deleted_at: None,
    }
  }
}
