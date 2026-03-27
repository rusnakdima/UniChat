use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthPendingSessionModel {
  pub state: String,
  pub code_verifier: String,
  pub created_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTokenModel {
  pub access_token: String,
  pub refresh_token: Option<String>,
  pub expires_in_seconds: Option<i64>,
}
