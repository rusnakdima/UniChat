use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PlatformTypeModel {
  Twitch,
  Kick,
  Youtube,
}

/// PlatformKey trait for converting PlatformTypeModel to string key
pub trait PlatformKey {
  fn as_key(&self) -> &'static str;
}

impl PlatformKey for PlatformTypeModel {
  fn as_key(&self) -> &'static str {
    match self {
      PlatformTypeModel::Twitch => "twitch",
      PlatformTypeModel::Kick => "kick",
      PlatformTypeModel::Youtube => "youtube",
    }
  }
}

impl PlatformTypeModel {
  /// Convert platform to string slice (alias for as_key)
  pub fn as_str(&self) -> &'static str {
    self.as_key()
  }
}
