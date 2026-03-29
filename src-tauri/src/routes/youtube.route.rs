use crate::helpers::http_client::shared_client;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct YouTubeLiveResponse {
  pub items: Option<Vec<YouTubeLiveItem>>,
}

#[derive(Deserialize)]
pub struct YouTubeLiveItem {
  #[serde(rename = "id")]
  pub id: Option<String>,
  #[serde(rename = "liveStreamingDetails")]
  pub live_streaming_details: Option<YouTubeLiveStreamingDetails>,
}

#[derive(Deserialize)]
pub struct YouTubeLiveStreamingDetails {
  #[serde(rename = "activeLiveChatId")]
  pub active_live_chat_id: Option<String>,
}

/// Fetch chat messages from YouTube live chat
/// This is the only YouTube command used by the frontend
#[tauri::command]
pub async fn youtubeFetchChatMessages(
  videoId: String,
  pageToken: Option<String>,
) -> Result<String, String> {
  let client = shared_client();

  let live_chat_id = youtube_fetch_live_chat_id_internal(client, &videoId).await?;

  if live_chat_id.is_empty() {
    return Ok("{\"messages\": [], \"nextPageToken\": \"\"}".to_string());
  }

  let mut url = format!(
    "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet,authorDetails&maxResults=200&liveChatId={}",
    live_chat_id
  );

  if let Some(token) = pageToken {
    url.push_str(&format!("&pageToken={}", token));
  }

  let response = client.get(&url).send().await.map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!("YouTube chat messages HTTP {}", response.status()));
  }

  response.text().await.map_err(|e| e.to_string())
}

/// Internal helper to fetch live chat ID (not exposed as Tauri command)
async fn youtube_fetch_live_chat_id_internal(
  client: &reqwest::Client,
  video_id: &str,
) -> Result<String, String> {
  let response = client
    .get(format!(
      "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={}",
      video_id
    ))
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!("YouTube API HTTP {}", response.status()));
  }

  let body: YouTubeLiveResponse = response.json().await.map_err(|e| e.to_string())?;
  Ok(
    body
      .items
      .and_then(|items| items.into_iter().next())
      .and_then(|item| item.live_streaming_details)
      .and_then(|details| details.active_live_chat_id)
      .unwrap_or_default(),
  )
}
