/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
/* nosql_orm */
use nosql_orm::{Model, Validate};
#[derive(Debug, Clone, Serialize, Deserialize, Model, Validate)]
#[table_name("custom_emotes")]
#[soft_delete]
#[timestamp]
#[index("platform", 1)]
#[index("channel_id", 1)]
pub struct CustomEmoteEntity {
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
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CustomEmoteCreateModel {
  #[validate(required)]
  pub platform: String,
  pub channel_id: Option<String>,
  #[validate(required)]
  pub emote_code: String,
  #[validate(required)]
  pub emote_url: String,
  #[serde(default)]
  pub emote_type: Option<String>,
}
impl From<CustomEmoteCreateModel> for CustomEmoteEntity {
  fn from(create: CustomEmoteCreateModel) -> Self {
    CustomEmoteEntity {
      id: None,
      platform: create.platform,
      channel_id: create.channel_id,
      emote_code: create.emote_code,
      emote_url: create.emote_url,
      emote_type: create.emote_type.unwrap_or_else(|| "custom".to_string()),
      created_at: None,
      updated_at: None,
      deleted_at: None,
    }
  }
}
