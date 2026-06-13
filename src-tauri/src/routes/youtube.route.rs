// Allow non_snake_case for Tauri IPC commands (camelCase is the convention for JavaScript interop)
#![allow(non_snake_case)]

use crate::helpers::youtube_api_channel::youtube_fetch_live_video_id_by_api_key;
use crate::helpers::youtube_api_channel::YouTubeChannelInfo;
use crate::helpers::youtube_api_channel::{
  youtube_fetch_channel_info_by_api_key, youtube_fetch_live_chat_id_by_api_key,
};
use crate::helpers::youtube_api_chat::youtube_fetch_live_chat_messages_by_api_key;

#[tauri::command]
pub async fn youtubeFetchLiveVideoIdByApiKey(
  channel_name: String,
  api_key: String,
) -> Result<String, String> {
  if api_key.is_empty() {
    return Err("API key is required".to_string());
  }

  youtube_fetch_live_video_id_by_api_key(&channel_name, &api_key).await
}

#[tauri::command]
pub async fn youtubeFetchChatMessages(
  video_id: String,
  page_token: Option<String>,
  api_key: Option<String>,
) -> Result<String, String> {
  let api_key = api_key.or_else(|| std::env::var("YOUTUBE_DATA_API_KEY").ok());

  let api_key = api_key.ok_or_else(|| {
    "YouTube API key not configured. Please set YOUTUBE_DATA_API_KEY in your .env file or add it in Settings > YouTube.".to_string()
  })?;

  let live_chat_id = youtube_fetch_live_chat_id_by_api_key(&video_id, &api_key).await?;

  if live_chat_id.is_empty() {
    return Ok(format!(
      "{{\"items\": [], \"nextPageToken\": \"\", \"pollingIntervalMillis\": {}}}",
      crate::constants::POLLING_INTERVAL_MS
    ));
  }

  youtube_fetch_live_chat_messages_by_api_key(&live_chat_id, &api_key, page_token.as_deref()).await
}

#[tauri::command]
pub async fn youtubeFetchChannelInfoByApiKey(
  channel_name: String,
  api_key: String,
) -> Result<YouTubeChannelInfo, String> {
  if api_key.is_empty() {
    return Err("API key is required".to_string());
  }

  youtube_fetch_channel_info_by_api_key(&channel_name, &api_key).await
}
