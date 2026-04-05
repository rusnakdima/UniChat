// Allow non_snake_case for Tauri IPC commands (camelCase is the convention for JavaScript interop)
#![allow(non_snake_case)]

use crate::helpers::youtube_api_helper::YouTubeChannelInfo;
use crate::helpers::youtube_api_helper::{
  youtube_delete_message_with_oauth, youtube_fetch_channel_info_by_api_key,
  youtube_fetch_channel_info_with_oauth, youtube_fetch_live_chat_id_by_api_key,
  youtube_fetch_live_chat_id_with_oauth, youtube_fetch_live_chat_messages_by_api_key,
  youtube_fetch_live_video_id_by_api_key, youtube_fetch_live_video_id_with_oauth,
  youtube_send_message_with_oauth,
};

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
pub async fn youtubeFetchLiveVideoId(
  channel_name: String,
  access_token: String,
) -> Result<String, String> {
  if access_token.is_empty() {
    return Err("Access token is required".to_string());
  }

  youtube_fetch_live_video_id_with_oauth(&channel_name, &access_token).await
}

#[tauri::command]
pub async fn youtubeFetchLiveChatId(
  video_id: String,
  access_token: String,
) -> Result<String, String> {
  if access_token.is_empty() {
    return Err("Access token is required".to_string());
  }

  youtube_fetch_live_chat_id_with_oauth(&video_id, &access_token).await
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
    return Ok(
      "{\"items\": [], \"nextPageToken\": \"\", \"pollingIntervalMillis\": 2000}".to_string(),
    );
  }

  youtube_fetch_live_chat_messages_by_api_key(&live_chat_id, &api_key, page_token.as_deref()).await
}

#[tauri::command]
pub async fn youtubeSendMessage(
  live_chat_id: String,
  message_text: String,
  access_token: String,
) -> Result<String, String> {
  if access_token.is_empty() {
    return Err(
      "Access token is required. Please connect your YouTube account in Settings.".to_string(),
    );
  }

  if message_text.trim().is_empty() {
    return Err("Message text cannot be empty".to_string());
  }

  youtube_send_message_with_oauth(&live_chat_id, &message_text, &access_token).await
}

#[tauri::command]
pub async fn youtubeDeleteMessage(
  message_id: String,
  access_token: String,
) -> Result<bool, String> {
  if access_token.is_empty() {
    return Err(
      "Access token is required. Please connect your YouTube account in Settings.".to_string(),
    );
  }

  youtube_delete_message_with_oauth(&message_id, &access_token).await?;
  Ok(true)
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

#[tauri::command]
pub async fn youtubeFetchChannelInfo(
  channel_name: String,
  access_token: String,
) -> Result<YouTubeChannelInfo, String> {
  if access_token.is_empty() {
    return Err("Access token is required".to_string());
  }

  youtube_fetch_channel_info_with_oauth(&channel_name, &access_token).await
}
