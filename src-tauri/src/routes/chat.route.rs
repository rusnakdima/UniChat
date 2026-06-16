use crate::helpers::http_client::shared_client;
use crate::helpers::http_error_helper::{build_fallback_urls, handle_http_error};
use crate::helpers::youtube_api_channel::youtube_fetch_live_video_id_by_api_key as youtube_fetch_live_video_id_by_api_key_internal;
use crate::helpers::youtube_api_channel::YouTubeChannelInfo;
use crate::helpers::youtube_api_channel::{
  youtube_fetch_channel_info_by_api_key as youtube_fetch_channel_info_by_api_key_internal,
  youtube_fetch_live_chat_id_by_api_key,
};
use crate::helpers::youtube_api_chat::youtube_fetch_live_chat_messages_by_api_key;
use crate::services::twitch::{TwitchChannelEmoteModel, TwitchService};
use crate::utils::validation::{validate_channel_slug, validate_message_id, validate_oauth_token};
use crate::AppState;
use crate::{log_debug, log_error, log_info};
use serde::Deserialize;
use serde::Serialize;

#[derive(Debug, Deserialize)]
pub struct KickChannelResponse {
  pub id: Option<i64>,
  pub chatroom: Option<KickChatroom>,
  #[serde(rename = "user")]
  pub user: Option<KickUser>,
}

#[derive(Debug, Deserialize)]
pub struct KickChatroom {
  pub id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct KickUser {
  pub id: Option<i64>,
  pub username: Option<String>,
  pub bio: Option<String>,
  #[serde(rename = "profile_pic")]
  pub profile_pic: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct KickChannelInfo {
  pub chatroom_id: i64,
  pub broadcaster_user_id: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct KickUserInfo {
  pub id: String,
  pub username: String,
  pub bio: String,
  pub profile_pic_url: String,
}

#[derive(Debug, Serialize)]
pub struct KickChannelInfoWithImage {
  pub id: i64,
  pub user_id: i64,
  pub username: String,
  pub profile_pic_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct KickSendMessageRequest {
  broadcaster_user_id: i64,
  content: String,
  #[serde(rename = "type")]
  message_type: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  reply_to_message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KickSendMessageResponse {
  data: KickSendMessageData,
}

#[derive(Debug, Deserialize)]
struct KickSendMessageData {
  is_sent: bool,
  message_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KickSendMessageResponseData {
  pub is_sent: bool,
  pub message_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KickDeleteMessageResponseData {
  pub is_deleted: bool,
  pub message_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KickEmoteInfo {
  pub name: String,
  pub url: String,
}

// KICK COMMANDS

#[tauri::command]
pub async fn kick_fetch_recent_messages(
  channel_slug: String,
  chatroom_id: i64,
) -> Result<String, String> {
  log_info!(
    "Fetching recent messages for chatroom: {} (channel: {})",
    chatroom_id,
    channel_slug
  );
  let client = shared_client();

  let url = format!(
    "https://api.kick.com/public/v1/chatrooms/{}/messages",
    chatroom_id
  );

  let response = client
    .get(&url)
    .header("Accept", "application/json")
    .send()
    .await;

  if let Ok(response) = response {
    if response.status().is_success() {
      if let Ok(body) = response.text().await {
        if !body.trim().is_empty() {
          log_debug!(
            "Fetched messages from primary endpoint for chatroom {}",
            chatroom_id
          );
          return Ok(body);
        }
      }
    }
  }

  let base = "https://kick.com";
  let paths = [
    &format!("/api/v2/chatrooms/{}/messages", chatroom_id)[..],
    &format!("/api/v1/chatrooms/{}/messages", chatroom_id)[..],
    &format!("/api/v2/channels/{}/messages", channel_slug)[..],
  ];
  let urls = build_fallback_urls(base, &paths);

  for url in urls {
    let response = client
      .get(&url)
      .header("Accept", "application/json, text/plain, */*")
      .header("Referer", format!("https://kick.com/{}", channel_slug))
      .send()
      .await;

    let Ok(response) = response else {
      continue;
    };

    if !response.status().is_success() {
      continue;
    }

    let body = response
      .text()
      .await
      .map_err(|e| format!("Failed to read response: {}", e))?;

    if !body.trim().is_empty() {
      log_debug!(
        "Fetched messages from fallback endpoint for chatroom {}",
        chatroom_id
      );
      return Ok(body);
    }
  }

  log_debug!(
    "No messages found for chatroom {}, returning empty array",
    chatroom_id
  );
  Ok("[]".to_string())
}

#[tauri::command]
pub async fn kick_send_chat_message(
  content: String,
  access_token: String,
  broadcaster_user_id: i64,
  reply_to_message_id: Option<String>,
) -> Result<KickSendMessageResponseData, String> {
  log_info!(
    "Sending chat message for broadcaster: {}, content length: {}",
    broadcaster_user_id,
    content.len()
  );
  let client = shared_client();

  let request_body = KickSendMessageRequest {
    broadcaster_user_id,
    content,
    message_type: "user".to_string(),
    reply_to_message_id,
  };

  let response = client
    .post("https://api.kick.com/public/v1/chat")
    .bearer_auth(&access_token)
    .json(&request_body)
    .send()
    .await
    .map_err(|e| {
      log_error!("Network error sending chat message: {}", e);
      format!("Network error: {}", e)
    })?;

  let status = response.status();

  if !status.is_success() {
    return Err(handle_http_error(status, "Kick message send"));
  }

  let data = response
    .json::<KickSendMessageResponse>()
    .await
    .map_err(|e| {
      log_error!("JSON parse error for send message response: {}", e);
      format!("Failed to parse response: {}", e)
    })?;

  log_info!(
    "Message sent successfully for broadcaster: {}, message_id: {}",
    broadcaster_user_id,
    data.data.message_id
  );
  Ok(KickSendMessageResponseData {
    is_sent: data.data.is_sent,
    message_id: data.data.message_id,
  })
}

#[tauri::command]
pub async fn kick_delete_chat_message(
  message_id: String,
  access_token: String,
) -> Result<KickDeleteMessageResponseData, String> {
  log_info!("Deleting chat message: {}", message_id);
  validate_message_id(&message_id).map_err(|e| {
    log_error!("Invalid message ID '{}': {}", message_id, e);
    format!("Invalid message ID: {}", e)
  })?;
  validate_oauth_token(&access_token).map_err(|e| {
    log_error!("Invalid access token for message deletion: {}", e);
    format!("Invalid access token: {}", e)
  })?;

  let client = shared_client();

  let response = client
    .delete(format!("https://api.kick.com/public/v1/chat/{message_id}"))
    .bearer_auth(&access_token)
    .send()
    .await
    .map_err(|e| {
      log_error!("Network error deleting message {}: {}", message_id, e);
      format!("Network error: {e}")
    })?;

  let status = response.status();

  if !status.is_success() {
    return Err(handle_http_error(status, "Kick message delete"));
  }

  log_info!("Message deleted successfully: {}", message_id);
  Ok(KickDeleteMessageResponseData {
    is_deleted: true,
    message_id,
  })
}

#[tauri::command]
pub async fn kick_fetch_chatroom_id(
  channel_slug: String,
  access_token: Option<String>,
) -> Result<KickChannelInfo, String> {
  log_info!("Fetching chatroom ID for channel: {}", channel_slug);
  validate_channel_slug(&channel_slug).map_err(|e| {
    log_error!("Invalid channel slug '{}': {}", channel_slug, e);
    format!("Invalid channel slug: {}", e)
  })?;

  if let Some(ref token) = access_token {
    validate_oauth_token(token).map_err(|e| {
      log_error!("Invalid access token: {}", e);
      format!("Invalid access token: {}", e)
    })?;
  }

  let client = shared_client();

  let url = format!("https://kick.com/api/v2/channels/{}", channel_slug);

  let mut request = client
    .get(&url)
    .header("Accept", "application/json, text/plain, */*")
    .header("Referer", "https://kick.com/")
    .header("User-Agent", "UniChat/1.0 (https://github.com/uni-chat)");

  if let Some(token) = &access_token {
    request = request.header("Authorization", format!("Bearer {}", token));
  }

  let response = request.send().await.map_err(|e| {
    log_error!(
      "Network error fetching chatroom ID for '{}': {}",
      channel_slug,
      e
    );
    format!("Network error: {}", e)
  })?;

  let status = response.status();

  if !status.is_success() {
    let context = format!("Channel '{}' on Kick", channel_slug);
    let err = handle_http_error(status, &context);
    log_error!("{}", &err);
    return Err(err);
  }

  let data = response.json::<KickChannelResponse>().await.map_err(|e| {
    log_error!("JSON parse error for channel '{}': {}", channel_slug, e);
    format!("Failed to parse response: {}", e)
  })?;

  let chatroom_id = data
    .chatroom
    .and_then(|c| c.id)
    .or(data.id)
    .ok_or_else(|| {
      log_error!(
        "Chatroom ID not found in response for channel '{}'",
        channel_slug
      );
      "Chatroom ID not found in response".to_string()
    })?;

  let broadcaster_user_id = data.user.and_then(|u| u.id).ok_or_else(|| {
    log_error!(
      "User ID not found in response for channel '{}'",
      channel_slug
    );
    "User ID not found in response".to_string()
  })?;

  log_info!(
    "Successfully fetched chatroom ID for channel: {}",
    channel_slug
  );
  Ok(KickChannelInfo {
    chatroom_id,
    broadcaster_user_id,
  })
}

#[tauri::command]
pub async fn kick_fetch_user_info(username: String) -> Result<KickUserInfo, String> {
  let client = shared_client();

  let url = format!("https://kick.com/api/v2/channels/{}", username);

  let response = client
    .get(&url)
    .header("Accept", "application/json, text/plain, */*")
    .header("Referer", "https://kick.com/")
    .send()
    .await
    .map_err(|e| e.to_string())?;

  let status = response.status();

  if !status.is_success() {
    return Err(handle_http_error(status, "User"));
  }

  let data = response
    .json::<KickChannelResponse>()
    .await
    .map_err(|e| e.to_string())?;

  let user = data
    .user
    .ok_or_else(|| "User data not found in response".to_string())?;

  Ok(KickUserInfo {
    id: user.id.unwrap_or(0).to_string(),
    username: user.username.unwrap_or_else(|| username.clone()),
    bio: user.bio.unwrap_or_default(),
    profile_pic_url: user.profile_pic.unwrap_or_default(),
  })
}

#[tauri::command]
pub async fn kick_fetch_channel_info(
  channel_slug: String,
) -> Result<KickChannelInfoWithImage, String> {
  log_info!("Fetching channel info for: {}", channel_slug);
  let client = shared_client();

  let url = format!("https://kick.com/api/v1/channels/{}", channel_slug);

  let response = client
    .get(&url)
    .header("Accept", "application/json")
    .send()
    .await
    .map_err(|e| {
      log_error!(
        "Network error fetching channel info for '{}': {}",
        channel_slug,
        e
      );
      format!("Network error: {}", e)
    })?;

  let status = response.status();

  if !status.is_success() {
    let context = format!("Channel '{}' on Kick", channel_slug);
    let err = handle_http_error(status, &context);
    log_error!("{}", &err);
    return Err(err);
  }

  let data = response.json::<KickChannelResponse>().await.map_err(|e| {
    log_error!(
      "JSON parse error for channel info '{}': {}",
      channel_slug,
      e
    );
    format!("Failed to parse response: {}", e)
  })?;

  let user = data.user.ok_or_else(|| {
    log_error!(
      "User data not found in response for channel '{}'",
      channel_slug
    );
    "User info not found in response"
  })?;
  let user_id = user.id.ok_or_else(|| {
    log_error!("User ID not found for channel '{}'", channel_slug);
    "User ID not found"
  })?;
  let username = user.username.unwrap_or_else(|| channel_slug.clone());
  let profile_pic_url = user.profile_pic;

  let channel_id = data
    .chatroom
    .and_then(|c| c.id)
    .or(data.id)
    .ok_or_else(|| {
      log_error!("Channel ID not found in response for '{}'", channel_slug);
      "Channel ID not found in response"
    })?;

  log_info!("Successfully fetched channel info for: {}", channel_slug);
  Ok(KickChannelInfoWithImage {
    id: channel_id,
    user_id,
    username,
    profile_pic_url,
  })
}

#[tauri::command]
pub async fn kick_fetch_channel_emotes(channel_slug: String) -> Result<Vec<KickEmoteInfo>, String> {
  log_info!("Fetching channel emotes for: {}", channel_slug);
  let client = shared_client();

  let url = format!("https://kick.com/api/v2/channels/{}/emotes", channel_slug);

  let response = client
    .get(&url)
    .header("Accept", "application/json")
    .send()
    .await
    .map_err(|e| {
      log_error!(
        "Network error fetching channel emotes for '{}': {}",
        channel_slug,
        e
      );
      format!("Network error: {}", e)
    })?;

  let status = response.status();

  if !status.is_success() {
    let context = format!("Channel '{}' emotes on Kick", channel_slug);
    let err = handle_http_error(status, &context);
    log_error!("{}", &err);
    return Err(err);
  }

  #[derive(Deserialize)]
  struct KickEmotesResponse {
    data: Vec<KickEmoteItem>,
  }

  #[derive(Deserialize)]
  struct KickEmoteItem {
    name: String,
    url: String,
  }

  let emotes_response = response.json::<KickEmotesResponse>().await.map_err(|e| {
    log_error!(
      "JSON parse error for channel emotes '{}': {}",
      channel_slug,
      e
    );
    format!("Failed to parse response: {}", e)
  })?;

  let emotes: Vec<KickEmoteInfo> = emotes_response
    .data
    .into_iter()
    .map(|row| KickEmoteInfo {
      name: row.name,
      url: row.url,
    })
    .collect();

  log_info!(
    "Fetched {} Kick channel emotes for channel {}",
    emotes.len(),
    channel_slug
  );
  Ok(emotes)
}

// TWITCH COMMANDS

#[tauri::command]
pub async fn twitch_delete_message(
  state: tauri::State<'_, AppState>,
  channel_id: String,
  message_id: String,
  access_token: String,
) -> Result<bool, String> {
  TwitchService::delete_message(&state, channel_id, message_id, access_token).await
}

#[tauri::command]
pub async fn twitch_fetch_channel_emotes(
  state: tauri::State<'_, AppState>,
  room_id: String,
) -> Result<Vec<TwitchChannelEmoteModel>, String> {
  TwitchService::fetch_channel_emotes(&state, room_id).await
}

// YOUTUBE COMMANDS

#[tauri::command]
pub async fn youtube_fetch_live_video_id_by_api_key(
  channel_name: String,
  api_key: String,
) -> Result<String, String> {
  if api_key.is_empty() {
    return Err("API key is required".to_string());
  }

  youtube_fetch_live_video_id_by_api_key_internal(&channel_name, &api_key).await
}

#[tauri::command]
pub async fn youtube_fetch_chat_messages(
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
pub async fn youtube_fetch_channel_info_by_api_key(
  channel_name: String,
  api_key: String,
) -> Result<YouTubeChannelInfo, String> {
  if api_key.is_empty() {
    return Err("API key is required".to_string());
  }

  youtube_fetch_channel_info_by_api_key_internal(&channel_name, &api_key).await
}
