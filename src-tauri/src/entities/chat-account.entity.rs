/* sys lib */
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
/* nosql_orm */
use nosql_orm::{Model, Validate};
#[derive(Debug, Clone, Serialize, Deserialize, Model, Validate)]
#[table_name("chat_accounts")]
#[soft_delete]
#[timestamp]
#[index("platform", 1)]
#[index("user_id", 1)]
pub struct ChatAccountEntity {
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
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ChatAccountCreateModel {
  #[validate(required)]
  pub platform: String,
  #[validate(required)]
  pub username: String,
  #[validate(required)]
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
impl From<ChatAccountCreateModel> for ChatAccountEntity {
  fn from(create: ChatAccountCreateModel) -> Self {
    ChatAccountEntity {
      id: None,
      platform: create.platform,
      username: create.username,
      user_id: create.user_id,
      avatar_url: create.avatar_url,
      auth_status: create
        .auth_status
        .unwrap_or_else(|| "unauthorized".to_string()),
      access_token: create.access_token,
      refresh_token: create.refresh_token,
      token_expires_at: create.token_expires_at,
      created_at: None,
      updated_at: None,
      deleted_at: None,
    }
  }
}
