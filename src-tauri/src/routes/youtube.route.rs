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

/// Fetch live video ID from channel name using API key
/// This is used when the user provides an API key instead of OAuth
#[tauri::command]
pub async fn youtubeFetchLiveVideoIdByApiKey(
  channel_name: String,
  api_key: String,
) -> Result<String, String> {
  println!(
    "[YouTube] Fetching live video ID for channel: {} (using API key)",
    channel_name
  );

  if api_key.is_empty() {
    return Err("API key is required".to_string());
  }

  let video_id = youtube_fetch_live_video_id_by_api_key(&channel_name, &api_key).await?;

  println!("[YouTube] Found live video ID: {}", video_id);
  Ok(video_id)
}

/// Fetch live video ID from channel name using OAuth access token
/// This is used when the user has connected their YouTube account via OAuth
#[tauri::command]
pub async fn youtubeFetchLiveVideoId(
  channel_name: String,
  access_token: String,
) -> Result<String, String> {
  println!(
    "[YouTube] Fetching live video ID for channel: {} (using OAuth)",
    channel_name
  );

  if access_token.is_empty() {
    return Err("Access token is required".to_string());
  }

  let video_id = youtube_fetch_live_video_id_with_oauth(&channel_name, &access_token).await?;

  println!("[YouTube] Found live video ID: {}", video_id);
  Ok(video_id)
}

/// Fetch active live chat ID using OAuth access token
/// Required for sending messages and moderation
#[tauri::command]
pub async fn youtubeFetchLiveChatId(
  video_id: String,
  access_token: String,
) -> Result<String, String> {
  println!("[YouTube] Fetching live chat ID for video: {}", video_id);

  if access_token.is_empty() {
    return Err("Access token is required".to_string());
  }

  let chat_id = youtube_fetch_live_chat_id_with_oauth(&video_id, &access_token).await?;

  println!("[YouTube] Found live chat ID: {}", chat_id);
  Ok(chat_id)
}

/// Fetch chat messages from YouTube live chat using API key
/// This is the main method for reading chat messages without OAuth
#[tauri::command]
pub async fn youtubeFetchChatMessages(
  video_id: String,
  page_token: Option<String>,
  api_key: Option<String>,
) -> Result<String, String> {
  // Try to get API key from parameter (frontend) first, then from environment
  let api_key = api_key.or_else(|| std::env::var("YOUTUBE_DATA_API_KEY").ok());

  println!(
    "[YouTube] Fetching chat messages for video: {} (page_token: {})",
    video_id,
    page_token.as_deref().unwrap_or("none")
  );

  // Require API key from either source
  let api_key = api_key.ok_or_else(|| {
    "YouTube API key not configured. Please set YOUTUBE_DATA_API_KEY in your .env file or add it in Settings > YouTube.".to_string()
  })?;

  println!("[YouTube] Using API key (length: {})", api_key.len());

  // First get the live chat ID
  let live_chat_id = youtube_fetch_live_chat_id_by_api_key(&video_id, &api_key).await?;

  if live_chat_id.is_empty() {
    println!(
      "[YouTube] No active live chat found for video: {}",
      video_id
    );
    return Ok(
      "{\"items\": [], \"nextPageToken\": \"\", \"pollingIntervalMillis\": 2000}".to_string(),
    );
  }

  println!("[YouTube] Found live chat ID: {}", live_chat_id);

  // Fetch messages
  let messages_json =
    youtube_fetch_live_chat_messages_by_api_key(&live_chat_id, &api_key, page_token.as_deref())
      .await?;

  Ok(messages_json)
}

/// Send a chat message using OAuth access token
/// Requires the user to have connected their YouTube account
#[tauri::command]
pub async fn youtubeSendMessage(
  live_chat_id: String,
  message_text: String,
  access_token: String,
) -> Result<String, String> {
  println!(
    "[YouTube] Sending message to chat {}: {}",
    live_chat_id, message_text
  );

  if access_token.is_empty() {
    return Err(
      "Access token is required. Please connect your YouTube account in Settings.".to_string(),
    );
  }

  if message_text.trim().is_empty() {
    return Err("Message text cannot be empty".to_string());
  }

  let message_id =
    youtube_send_message_with_oauth(&live_chat_id, &message_text, &access_token).await?;

  println!("[YouTube] Message sent successfully: {}", message_id);
  Ok(message_id)
}

/// Delete a chat message using OAuth access token
/// Requires moderator or owner permissions
#[tauri::command]
pub async fn youtubeDeleteMessage(
  message_id: String,
  access_token: String,
) -> Result<bool, String> {
  println!("[YouTube] Deleting message: {}", message_id);

  if access_token.is_empty() {
    return Err(
      "Access token is required. Please connect your YouTube account in Settings.".to_string(),
    );
  }

  youtube_delete_message_with_oauth(&message_id, &access_token).await?;

  println!("[YouTube] Message deleted successfully: {}", message_id);
  Ok(true)
}

/// Fetch channel info including profile image URL using API key
/// This is used to load channel profile images for display
#[tauri::command]
pub async fn youtubeFetchChannelInfoByApiKey(
  channel_name: String,
  api_key: String,
) -> Result<YouTubeChannelInfo, String> {
  println!(
    "[YouTube] Fetching channel info for: {} (using API key)",
    channel_name
  );

  if api_key.is_empty() {
    return Err("API key is required".to_string());
  }

  let channel_info = youtube_fetch_channel_info_by_api_key(&channel_name, &api_key).await?;

  println!(
    "[YouTube] Found channel: {} (id: {})",
    channel_info.title, channel_info.id
  );
  Ok(channel_info)
}

/// Fetch channel info including profile image URL using OAuth access token
/// This is used when the user has connected their YouTube account via OAuth
#[tauri::command]
pub async fn youtubeFetchChannelInfo(
  channel_name: String,
  access_token: String,
) -> Result<YouTubeChannelInfo, String> {
  println!(
    "[YouTube] Fetching channel info for: {} (using OAuth)",
    channel_name
  );

  if access_token.is_empty() {
    return Err("Access token is required".to_string());
  }

  let channel_info = youtube_fetch_channel_info_with_oauth(&channel_name, &access_token).await?;

  println!(
    "[YouTube] Found channel: {} (id: {})",
    channel_info.title, channel_info.id
  );
  Ok(channel_info)
}
