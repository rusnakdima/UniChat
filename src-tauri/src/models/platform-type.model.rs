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
