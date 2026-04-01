use serde::{Deserialize, Serialize};

use crate::models::platform_type_model::PlatformTypeModel;

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AuthStatusModel {
  Unauthorized,
  Authorized,
  TokenExpired,
  Revoked,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthAccountModel {
  pub id: String,
  pub platform: PlatformTypeModel,
  pub username: String,
  pub user_id: String,
  pub avatar_url: Option<String>,
  pub access_token: Option<String>,
  pub refresh_token: Option<String>,
  pub auth_status: AuthStatusModel,
  pub token_expires_at: Option<String>,
  pub authorized_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCommandResultModel {
  pub success: bool,
  pub message: String,
  pub auth_url: Option<String>,
  pub account: Option<AuthAccountModel>,
  pub accounts: Option<Vec<AuthAccountModel>>,
}
