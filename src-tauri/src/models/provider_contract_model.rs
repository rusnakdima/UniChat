use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlatformTypeModel {
  Twitch,
  Kick,
  Youtube,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionModeModel {
  Account,
  ChannelWatch,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageReferenceModel {
  pub source_message_id: String,
  pub source_channel_id: String,
  pub source_user_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilitiesModel {
  pub can_listen: bool,
  pub can_reply: bool,
  pub can_delete: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCommandResultModel {
  pub platform: PlatformTypeModel,
  pub connection_mode: Option<ConnectionModeModel>,
  pub summary: String,
  pub capabilities: ProviderCapabilitiesModel,
}
