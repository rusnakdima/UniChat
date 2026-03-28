use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum OverlayWidgetFilterModel {
  All,
  Supporters,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageEmoteModel {
  pub provider: String,
  pub id: String,
  pub code: String,
  pub start: u32,
  pub end: u32,
  pub url: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceChatMessageModel {
  pub id: String,
  pub platform: String, // "twitch" | "kick" | "youtube"
  pub author: String,
  pub text: String,
  pub timestamp: String,
  pub is_supporter: bool,
  pub source_channel_id: String,
  pub author_avatar_url: Option<String>,
  pub emotes: Option<Vec<ChatMessageEmoteModel>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayMessageModel {
  pub id: String,
  pub platform: String,
  pub author: String,
  pub text: String,
  pub timestamp: String,
  pub is_supporter: bool,
  pub source_channel_id: String,
  pub author_avatar_url: Option<String>,
  pub channel_image_url: Option<String>, // Channel profile image for multi-channel overlays
  pub emotes: Option<Vec<ChatMessageEmoteModel>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayWsSubscribeModel {
  pub widget_id: String,
  pub filter: Option<OverlayWidgetFilterModel>,
  pub channel_ids: Option<Vec<String>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayWsIncomingModel {
  #[serde(rename = "type")]
  pub kind: String,
  pub message: Option<SourceChatMessageModel>,
  pub subscribe: Option<OverlayWsSubscribeModel>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayWsOutgoingModel {
  #[serde(rename = "type")]
  pub kind: String,
  pub message: Option<OverlayMessageModel>,
}
