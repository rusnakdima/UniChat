//! YouTube Data API v3 helper functions
//! Supports both API key (read-only) and OAuth (full access) authentication

use crate::helpers::http_client::shared_client;
use serde::Deserialize;

enum AuthMethod {
  ApiKey(String),
}

impl AuthMethod {
  fn apply_to_request(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    request
  }

  fn key_param(&self) -> Option<String> {
    match self {
      AuthMethod::ApiKey(key) => Some(format!("key={}", key)),
    }
  }
}

fn youtube_api_error(context: &str, status: reqwest::StatusCode, error_text: &str) -> String {
  format!("YouTube {} API error ({}): {}", context, status, error_text)
}

/// Response from YouTube Data API v3 search endpoint
#[derive(Debug, Deserialize)]
pub struct YouTubeSearchResponse {
  pub items: Option<Vec<YouTubeSearchItem>>,
  #[serde(rename = "nextPageToken")]
  pub next_page_token: Option<String>,
}

/// Individual search result item
#[derive(Debug, Deserialize)]
pub struct YouTubeSearchItem {
  pub id: YouTubeVideoId,
  #[serde(rename = "snippet")]
  pub snippet: Option<YouTubeSnippet>,
}

/// Video ID structure from search results
#[derive(Debug, Deserialize)]
pub struct YouTubeVideoId {
  #[serde(rename = "videoId")]
  pub video_id: Option<String>,
}

/// Snippet containing broadcast information
#[derive(Debug, Deserialize)]
pub struct YouTubeSnippet {
  #[serde(rename = "liveBroadcastContent")]
  pub live_broadcast_content: Option<String>,
}

/// Response from YouTube Data API v3 videos endpoint
#[derive(Debug, Deserialize)]
pub struct YouTubeVideosResponse {
  pub items: Option<Vec<YouTubeVideoItem>>,
}

/// Video item with live streaming details
#[derive(Debug, Deserialize)]
pub struct YouTubeVideoItem {
  pub id: Option<String>,
  #[serde(rename = "liveStreamingDetails")]
  pub live_streaming_details: Option<YouTubeLiveStreamingDetails>,
  #[serde(rename = "snippet")]
  pub snippet: Option<YouTubeVideoSnippet>,
}

/// Live streaming details containing the active chat ID
#[derive(Debug, Deserialize)]
pub struct YouTubeLiveStreamingDetails {
  #[serde(rename = "activeLiveChatId")]
  pub active_live_chat_id: Option<String>,
  #[serde(rename = "actualStartTime")]
  pub actual_start_time: Option<String>,
}

/// Video snippet for channel information
#[derive(Debug, Deserialize)]
pub struct YouTubeVideoSnippet {
  pub title: Option<String>,
  #[serde(rename = "channelId")]
  pub channel_id: Option<String>,
  #[serde(rename = "channelTitle")]
  pub channel_title: Option<String>,
}

/// Response from live chat messages endpoint
#[derive(Debug, Deserialize)]
pub struct YouTubeLiveChatMessagesResponse {
  pub items: Option<Vec<YouTubeLiveChatMessage>>,
  #[serde(rename = "nextPageToken")]
  pub next_page_token: Option<String>,
  #[serde(rename = "pollingIntervalMillis")]
  pub polling_interval_millis: Option<u64>,
}

/// Individual live chat message
#[derive(Debug, Deserialize)]
pub struct YouTubeLiveChatMessage {
  pub id: String,
  pub snippet: Option<YouTubeChatSnippet>,
  #[serde(rename = "authorDetails")]
  pub author_details: Option<YouTubeAuthorDetails>,
}

/// Chat message snippet
#[derive(Debug, Deserialize)]
pub struct YouTubeChatSnippet {
  #[serde(rename = "type")]
  pub message_type: Option<String>,
  #[serde(rename = "displayMessage")]
  pub display_message: Option<String>,
  #[serde(rename = "publishedAt")]
  pub published_at: Option<String>,
  #[serde(rename = "textMessageDetails")]
  pub text_message_details: Option<YouTubeTextMessageDetails>,
}

/// Text message details
#[derive(Debug, Deserialize)]
pub struct YouTubeTextMessageDetails {
  #[serde(rename = "messageText")]
  pub message_text: Option<String>,
}

/// Author details for a chat message
#[derive(Debug, Deserialize)]
pub struct YouTubeAuthorDetails {
  #[serde(rename = "displayName")]
  pub display_name: Option<String>,
  #[serde(rename = "channelId")]
  pub channel_id: Option<String>,
  #[serde(rename = "profileImageUrl")]
  pub profile_image_url: Option<String>,
  #[serde(rename = "isChatSponsor")]
  pub is_chat_sponsor: Option<bool>,
  #[serde(rename = "isChatOwner")]
  pub is_chat_owner: Option<bool>,
  #[serde(rename = "isChatModerator")]
  pub is_chat_moderator: Option<bool>,
}

/// Response when sending a chat message
#[derive(Debug, Deserialize)]
pub struct YouTubeSendMessageResponse {
  pub data: YouTubeMessageData,
}

#[derive(Debug, Deserialize)]
pub struct YouTubeMessageData {
  pub id: String,
  pub snippet: Option<YouTubeChatSnippet>,
}

/// Fetch live video ID from a channel name using API key
/// Returns the video ID of the current live broadcast
pub async fn youtube_fetch_live_video_id_by_api_key(
  channel_name: &str,
  api_key: &str,
) -> Result<String, String> {
  youtube_fetch_live_video_id_internal(channel_name, &AuthMethod::ApiKey(api_key.to_string())).await
}

async fn youtube_fetch_live_video_id_internal(
  channel_name: &str,
  auth: &AuthMethod,
) -> Result<String, String> {
  let client = shared_client();

  let channel_id = if channel_name.starts_with("UC") && channel_name.len() == 24 {
    channel_name.to_string()
  } else {
    fetch_channel_id_internal(&client, channel_name, auth).await?
  };

  let key_param = auth
    .key_param()
    .map(|p| format!("&{}", p))
    .unwrap_or_default();
  let search_url = format!(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId={}&type=video&eventType=live&order=relevance&maxResults=1{}",
    channel_id, key_param
  );

  let request = client.get(&search_url);
  let response = auth
    .apply_to_request(request)
    .send()
    .await
    .map_err(|e| format!("Failed to search for live video: {}", e))?;

  if !response.status().is_success() {
    return Err(youtube_api_error(
      "search",
      response.status(),
      &response.text().await.unwrap_or_default(),
    ));
  }

  let search_result: YouTubeSearchResponse = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse search response: {}", e))?;

  if let Some(items) = search_result.items {
    for item in items {
      if let Some(snippet) = item.snippet {
        if snippet.live_broadcast_content == Some("live".to_string()) {
          if let Some(video_id) = item.id.video_id {
            return Ok(video_id);
          }
        }
      }
    }
  }

  Err("No live video found for this channel".to_string())
}

async fn fetch_channel_id_internal(
  client: &reqwest::Client,
  channel_name: &str,
  auth: &AuthMethod,
) -> Result<String, String> {
  let key_param = auth
    .key_param()
    .map(|p| format!("&{}", p))
    .unwrap_or_default();
  let search_url = format!(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&q={}&type=channel&maxResults=1{}",
    urlencoding::encode(channel_name),
    key_param
  );

  let request = client.get(&search_url);
  let response = auth
    .apply_to_request(request)
    .send()
    .await
    .map_err(|e| format!("Failed to search for channel: {}", e))?;

  if !response.status().is_success() {
    return Err(youtube_api_error(
      "channel search",
      response.status(),
      &response.text().await.unwrap_or_default(),
    ));
  }

  let search_result: YouTubeSearchResponse = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse channel search response: {}", e))?;

  if let Some(items) = search_result.items {
    if let Some(first_item) = items.first() {
      if let Some(channel_id) = &first_item.id.video_id {
        return Ok(channel_id.clone());
      }
    }
  }

  Err(format!("Channel not found: {}", channel_name))
}

/// Fetch active live chat ID using API key
pub async fn youtube_fetch_live_chat_id_by_api_key(
  video_id: &str,
  api_key: &str,
) -> Result<String, String> {
  let client = shared_client();
  youtube_fetch_live_chat_id_internal(&client, video_id, &AuthMethod::ApiKey(api_key.to_string()))
    .await
}

async fn youtube_fetch_live_chat_id_internal(
  client: &reqwest::Client,
  video_id: &str,
  auth: &AuthMethod,
) -> Result<String, String> {
  let url = format!(
    "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={}{}",
    video_id,
    auth
      .key_param()
      .map(|p| format!("&{}", p))
      .unwrap_or_default()
  );

  let request = client.get(&url);
  let response = auth
    .apply_to_request(request)
    .send()
    .await
    .map_err(|e| format!("Failed to fetch video details: {}", e))?;

  if !response.status().is_success() {
    return Err(youtube_api_error(
      "videos",
      response.status(),
      &response.text().await.unwrap_or_default(),
    ));
  }

  let videos_result: YouTubeVideosResponse = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse videos response: {}", e))?;

  if let Some(items) = videos_result.items {
    if let Some(first_item) = items.first() {
      if let Some(details) = &first_item.live_streaming_details {
        if let Some(chat_id) = &details.active_live_chat_id {
          return Ok(chat_id.clone());
        }
      }
    }
  }

  Err("No active live chat found for this video".to_string())
}

/// Fetch live chat messages using API key
pub async fn youtube_fetch_live_chat_messages_by_api_key(
  live_chat_id: &str,
  api_key: &str,
  page_token: Option<&str>,
) -> Result<String, String> {
  let client = shared_client();

  let mut url = format!(
    "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet,authorDetails&maxResults=200&liveChatId={}&key={}",
    live_chat_id, api_key
  );

  if let Some(token) = page_token {
    url.push_str(&format!("&pageToken={}", token));
  }

  let response = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Failed to fetch chat messages: {}", e))?;

  if !response.status().is_success() {
    return Err(youtube_api_error(
      "live chat messages",
      response.status(),
      &response.text().await.unwrap_or_default(),
    ));
  }

  response
    .text()
    .await
    .map_err(|e| format!("Failed to read response body: {}", e))
}

/// Response structure for YouTube channel info
#[derive(Debug, serde::Serialize)]
pub struct YouTubeChannelInfo {
  pub id: String,
  pub title: String,
  pub custom_url: Option<String>,
  pub profile_image_url: Option<String>,
  pub banner_image_url: Option<String>,
}

/// Fetch channel info including profile image URL using API key
pub async fn youtube_fetch_channel_info_by_api_key(
  channel_id_or_name: &str,
  api_key: &str,
) -> Result<YouTubeChannelInfo, String> {
  youtube_fetch_channel_info_internal(channel_id_or_name, &AuthMethod::ApiKey(api_key.to_string()))
    .await
}

async fn youtube_fetch_channel_info_internal(
  channel_id_or_name: &str,
  auth: &AuthMethod,
) -> Result<YouTubeChannelInfo, String> {
  let client = shared_client();

  let (id_param, id_value) =
    if channel_id_or_name.starts_with("UC") && channel_id_or_name.len() == 24 {
      ("id", channel_id_or_name)
    } else {
      ("forUsername", channel_id_or_name)
    };

  let key_param = auth
    .key_param()
    .map(|p| format!("&{}", p))
    .unwrap_or_default();
  let url = format!(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&{}={}{}",
    id_param,
    urlencoding::encode(id_value),
    key_param
  );

  let request = client.get(&url);
  let response = auth
    .apply_to_request(request)
    .send()
    .await
    .map_err(|e| format!("Failed to fetch channel info: {}", e))?;

  if !response.status().is_success() {
    return Err(youtube_api_error(
      "channel",
      response.status(),
      &response.text().await.unwrap_or_default(),
    ));
  }

  let data: serde_json::Value = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse channel response: {}", e))?;

  let items = data["items"].as_array();
  let items =
    items.ok_or_else(|| format!("No items in response for channel: {}", channel_id_or_name))?;
  if items.is_empty() {
    return Err(format!("Channel not found: {}", channel_id_or_name));
  }

  let channel = &items[0];
  let snippet = &channel["snippet"];
  let branding = &channel["brandingSettings"]["channel"];

  let profile_image_url = branding["profileImageUrl"].as_str().map(|s| s.to_string());
  let banner_image_url = branding["bannerImageUrl"].as_str().map(|s| s.to_string());

  Ok(YouTubeChannelInfo {
    id: channel["id"].as_str().unwrap_or("").to_string(),
    title: snippet["title"].as_str().unwrap_or("").to_string(),
    custom_url: branding["customUrl"].as_str().map(|s| s.to_string()),
    profile_image_url,
    banner_image_url,
  })
}
