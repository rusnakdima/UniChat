use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub enum Platform {
  Twitch,
  Kick,
  YouTube,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct OAuthToken(pub String);

impl OAuthToken {
  pub fn validate(token: &str) -> bool {
    token.len() >= 10 && token.len() <= 1000
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
pub struct ChannelSlug(pub String);

impl ChannelSlug {
  pub fn validate(s: &str) -> bool {
    !s.is_empty()
      && s.len() <= 50
      && s
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
  }
}
