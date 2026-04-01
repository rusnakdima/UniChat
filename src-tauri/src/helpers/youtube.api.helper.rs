//! YouTube Data API v3 helper functions
//! Supports both API key (read-only) and OAuth (full access) authentication

use crate::helpers::http_client::shared_client;
use serde::Deserialize;

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
  let client = shared_client();

  // First, try to get the channel ID from the channel name
  let channel_id = if channel_name.starts_with("UC") && channel_name.len() == 24 {
    // Already a channel ID
    channel_name.to_string()
  } else {
    // Search for channel by name
    fetch_channel_id_by_name(client, channel_name, api_key).await?
  };

  // Search for live videos from this channel
  let search_url = format!(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId={}&type=video&eventType=live&order=relevance&maxResults=1&key={}",
    channel_id, api_key
  );

  let response = client
    .get(&search_url)
    .send()
    .await
    .map_err(|e| format!("Failed to search for live video: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube search API error ({}): {}",
      status, error_text
    ));
  }

  let search_result: YouTubeSearchResponse = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse search response: {}", e))?;

  // Find the live video
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

/// Fetch channel ID by channel name or custom URL
async fn fetch_channel_id_by_name(
  client: &reqwest::Client,
  channel_name: &str,
  api_key: &str,
) -> Result<String, String> {
  // Try to find channel by custom URL or username
  let search_url = format!(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&q={}&type=channel&maxResults=1&key={}",
    urlencoding::encode(channel_name),
    api_key
  );

  let response = client
    .get(&search_url)
    .send()
    .await
    .map_err(|e| format!("Failed to search for channel: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube channel search error ({}): {}",
      status, error_text
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

  let url = format!(
    "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={}&key={}",
    video_id, api_key
  );

  let response = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Failed to fetch video details: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube videos API error ({}): {}",
      status, error_text
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
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube live chat messages API error ({}): {}",
      status, error_text
    ));
  }

  response
    .text()
    .await
    .map_err(|e| format!("Failed to read response body: {}", e))
}

/// Fetch live chat ID using OAuth access token
pub async fn youtube_fetch_live_chat_id_with_oauth(
  video_id: &str,
  access_token: &str,
) -> Result<String, String> {
  let client = shared_client();

  let url = format!(
    "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={}",
    video_id
  );

  let response = client
    .get(&url)
    .header("Authorization", format!("Bearer {}", access_token))
    .send()
    .await
    .map_err(|e| format!("Failed to fetch video details: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube videos API error ({}): {}",
      status, error_text
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

/// Send a chat message using OAuth access token
pub async fn youtube_send_message_with_oauth(
  live_chat_id: &str,
  message_text: &str,
  access_token: &str,
) -> Result<String, String> {
  let client = shared_client();

  let url = "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet";

  let request_body = serde_json::json!({
    "snippet": {
      "liveChatId": live_chat_id,
      "type": "textMessageEvent",
      "textMessageDetails": {
        "messageText": message_text
      }
    }
  });

  let response = client
    .post(url)
    .header("Authorization", format!("Bearer {}", access_token))
    .header("Content-Type", "application/json")
    .json(&request_body)
    .send()
    .await
    .map_err(|e| format!("Failed to send message: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube send message error ({}): {}",
      status, error_text
    ));
  }

  let result: YouTubeSendMessageResponse = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse send message response: {}", e))?;

  Ok(result.data.id)
}

/// Delete a chat message using OAuth access token
pub async fn youtube_delete_message_with_oauth(
  message_id: &str,
  access_token: &str,
) -> Result<(), String> {
  let client = shared_client();

  let url = format!(
    "https://www.googleapis.com/youtube/v3/liveChat/messages?id={}",
    message_id
  );

  let response = client
    .delete(&url)
    .header("Authorization", format!("Bearer {}", access_token))
    .send()
    .await
    .map_err(|e| format!("Failed to delete message: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube delete message error ({}): {}",
      status, error_text
    ));
  }

  Ok(())
}

/// Fetch live video ID using OAuth access token
pub async fn youtube_fetch_live_video_id_with_oauth(
  channel_name: &str,
  access_token: &str,
) -> Result<String, String> {
  let client = shared_client();

  // First, try to get the channel ID from the channel name
  let channel_id = if channel_name.starts_with("UC") && channel_name.len() == 24 {
    // Already a channel ID
    channel_name.to_string()
  } else {
    // Search for channel by name using OAuth
    fetch_channel_id_by_name_oauth(client, channel_name, access_token).await?
  };

  // Search for live videos from this channel
  let search_url = format!(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId={}&type=video&eventType=live&order=relevance&maxResults=1",
    channel_id
  );

  let response = client
    .get(&search_url)
    .header("Authorization", format!("Bearer {}", access_token))
    .send()
    .await
    .map_err(|e| format!("Failed to search for live video: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube search API error ({}): {}",
      status, error_text
    ));
  }

  let search_result: YouTubeSearchResponse = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse search response: {}", e))?;

  // Find the live video
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

/// Fetch channel ID by channel name using OAuth
async fn fetch_channel_id_by_name_oauth(
  client: &reqwest::Client,
  channel_name: &str,
  access_token: &str,
) -> Result<String, String> {
  let search_url = format!(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&q={}&type=channel&maxResults=1",
    urlencoding::encode(channel_name)
  );

  let response = client
    .get(&search_url)
    .header("Authorization", format!("Bearer {}", access_token))
    .send()
    .await
    .map_err(|e| format!("Failed to search for channel: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube channel search error ({}): {}",
      status, error_text
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
  let client = shared_client();

  // Determine if input is channel ID or name
  let (id_param, id_value) =
    if channel_id_or_name.starts_with("UC") && channel_id_or_name.len() == 24 {
      ("id", channel_id_or_name)
    } else {
      ("forUsername", channel_id_or_name)
    };

  let url = format!(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&{}={}&key={}",
    id_param,
    urlencoding::encode(id_value),
    api_key
  );

  let response = client
    .get(&url)
    .send()
    .await
    .map_err(|e| format!("Failed to fetch channel info: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube channel API error ({}): {}",
      status, error_text
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

/// Fetch channel info including profile image URL using OAuth
pub async fn youtube_fetch_channel_info_with_oauth(
  channel_id_or_name: &str,
  access_token: &str,
) -> Result<YouTubeChannelInfo, String> {
  let client = shared_client();

  // Determine if input is channel ID or name
  let (id_param, id_value) =
    if channel_id_or_name.starts_with("UC") && channel_id_or_name.len() == 24 {
      ("id", channel_id_or_name)
    } else {
      ("forUsername", channel_id_or_name)
    };

  let url = format!(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&{}={}",
    id_param,
    urlencoding::encode(id_value)
  );

  let response = client
    .get(&url)
    .header("Authorization", format!("Bearer {}", access_token))
    .send()
    .await
    .map_err(|e| format!("Failed to fetch channel info: {}", e))?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube channel API error ({}): {}",
      status, error_text
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
