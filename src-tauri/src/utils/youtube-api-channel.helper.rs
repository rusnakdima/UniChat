use crate::utils::http_client::shared_client;
use serde::Deserialize;

use super::youtube_api_auth::{
  api_error, apply_auth, get_auth_method, get_key_param, YouTubeSearchResponse,
};

#[derive(Debug, Deserialize)]
pub struct YouTubeVideosResponse {
  pub items: Option<Vec<YouTubeVideoItem>>,
}

#[derive(Debug, Deserialize)]
pub struct YouTubeVideoItem {
  pub id: Option<String>,
  #[serde(rename = "liveStreamingDetails")]
  pub live_streaming_details: Option<YouTubeLiveStreamingDetails>,
  #[serde(rename = "snippet")]
  pub snippet: Option<YouTubeVideoSnippet>,
}

#[derive(Debug, Deserialize)]
pub struct YouTubeLiveStreamingDetails {
  #[serde(rename = "activeLiveChatId")]
  pub active_live_chat_id: Option<String>,
  #[serde(rename = "actualStartTime")]
  pub actual_start_time: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct YouTubeVideoSnippet {
  pub title: Option<String>,
  #[serde(rename = "channelId")]
  pub channel_id: Option<String>,
  #[serde(rename = "channelTitle")]
  pub channel_title: Option<String>,
}

pub async fn youtube_fetch_live_video_id_by_api_key(
  channel_name: &str,
  api_key: &str,
) -> Result<String, String> {
  let auth = get_auth_method(api_key);
  youtube_fetch_live_video_id_internal(channel_name, &auth).await
}

async fn youtube_fetch_live_video_id_internal(
  channel_name: &str,
  auth: &super::youtube_api_auth::AuthMethod,
) -> Result<String, String> {
  let client = shared_client();

  let channel_id = if channel_name.starts_with("UC") && channel_name.len() == 24 {
    channel_name.to_string()
  } else {
    fetch_channel_id_internal(&client, channel_name, auth).await?
  };

  let key_param = get_key_param(auth)
    .map(|p| format!("&{}", p))
    .unwrap_or_default();
  let search_url = format!(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId={}&type=video&eventType=live&order=relevance&maxResults=1{}",
    channel_id, key_param
  );

  let request = client.get(&search_url);
  let response = apply_auth(request, auth)
    .send()
    .await
    .map_err(|e| format!("Failed to search for live video: {}", e))?;

  if !response.status().is_success() {
    return Err(api_error(
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
  auth: &super::youtube_api_auth::AuthMethod,
) -> Result<String, String> {
  let key_param = get_key_param(auth)
    .map(|p| format!("&{}", p))
    .unwrap_or_default();
  let search_url = format!(
    "https://www.googleapis.com/youtube/v3/search?part=snippet&q={}&type=channel&maxResults=1{}",
    urlencoding::encode(channel_name),
    key_param
  );

  let request = client.get(&search_url);
  let response = apply_auth(request, auth)
    .send()
    .await
    .map_err(|e| format!("Failed to search for channel: {}", e))?;

  if !response.status().is_success() {
    return Err(api_error(
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

#[derive(Debug, serde::Serialize)]
pub struct YouTubeChannelInfo {
  pub id: String,
  pub title: String,
  pub custom_url: Option<String>,
  pub profile_image_url: Option<String>,
  pub banner_image_url: Option<String>,
}

pub async fn youtube_fetch_channel_info_by_api_key(
  channel_id_or_name: &str,
  api_key: &str,
) -> Result<YouTubeChannelInfo, String> {
  let auth = get_auth_method(api_key);
  youtube_fetch_channel_info_internal(channel_id_or_name, &auth).await
}

async fn youtube_fetch_channel_info_internal(
  channel_id_or_name: &str,
  auth: &super::youtube_api_auth::AuthMethod,
) -> Result<YouTubeChannelInfo, String> {
  let client = shared_client();

  let (id_param, id_value) =
    if channel_id_or_name.starts_with("UC") && channel_id_or_name.len() == 24 {
      ("id", channel_id_or_name)
    } else {
      ("forUsername", channel_id_or_name)
    };

  let key_param = get_key_param(auth)
    .map(|p| format!("&{}", p))
    .unwrap_or_default();
  let url = format!(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&{}={}{}",
    id_param,
    urlencoding::encode(id_value),
    key_param
  );

  let request = client.get(&url);
  let response = apply_auth(request, auth)
    .send()
    .await
    .map_err(|e| format!("Failed to fetch channel info: {}", e))?;

  if !response.status().is_success() {
    return Err(api_error(
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

pub async fn youtube_fetch_live_chat_id_by_api_key(
  video_id: &str,
  api_key: &str,
) -> Result<String, String> {
  let client = shared_client();
  let auth = get_auth_method(api_key);
  youtube_fetch_live_chat_id_internal(&client, video_id, &auth).await
}

async fn youtube_fetch_live_chat_id_internal(
  client: &reqwest::Client,
  video_id: &str,
  auth: &super::youtube_api_auth::AuthMethod,
) -> Result<String, String> {
  let url = format!(
    "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={}{}",
    video_id,
    get_key_param(auth)
      .map(|p| format!("&{}", p))
      .unwrap_or_default()
  );

  let request = client.get(&url);
  let response = apply_auth(request, auth)
    .send()
    .await
    .map_err(|e| format!("Failed to fetch video details: {}", e))?;

  if !response.status().is_success() {
    return Err(api_error(
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
