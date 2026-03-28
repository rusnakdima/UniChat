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
  #[serde(rename = "snippet")]
  pub snippet: Option<YouTubeChatSnippet>,
  #[serde(rename = "authorDetails")]
  pub author_details: Option<YouTubeAuthorDetails>,
}

#[derive(Deserialize)]
pub struct YouTubeLiveStreamingDetails {
  #[serde(rename = "activeLiveChatId")]
  pub active_live_chat_id: Option<String>,
}

#[derive(Deserialize)]
pub struct YouTubeChatSnippet {
  #[serde(rename = "type")]
  pub type_field: Option<String>,
  #[serde(rename = "displayMessage")]
  pub display_message: Option<String>,
  #[serde(rename = "publishedAt")]
  pub published_at: Option<String>,
}

#[derive(Deserialize)]
pub struct YouTubeAuthorDetails {
  #[serde(rename = "displayName")]
  pub display_name: Option<String>,
  #[serde(rename = "channelId")]
  pub channel_id: Option<String>,
  #[serde(rename = "isChatSponsor")]
  pub is_chat_sponsor: Option<bool>,
}

#[derive(Deserialize)]
pub struct YouTubeChannelResponse {
  pub items: Option<Vec<YouTubeChannelItem>>,
}

#[derive(Deserialize)]
pub struct YouTubeChannelItem {
  pub id: Option<String>,
}

#[tauri::command]
pub async fn youtubeFetchLiveChatId(
  videoId: String,
  accessToken: String,
) -> Result<String, String> {
  let client = reqwest::Client::new();
  let response = client
    .get(format!(
      "https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id={}",
      videoId
    ))
    .header("Authorization", format!("Bearer {}", accessToken))
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

#[tauri::command]
pub async fn youtubeSendMessage(
  liveChatId: String,
  messageText: String,
  accessToken: String,
) -> Result<String, String> {
  let client = reqwest::Client::new();
  let response = client
    .post("https://www.googleapis.com/youtube/v3/liveChat/messages")
    .query(&[("part", "snippet")])
    .header("Authorization", format!("Bearer {}", accessToken))
    .header("Content-Type", "application/json")
    .json(&serde_json::json!({
        "snippet": {
            "liveChatId": liveChatId,
            "type": "textMessageEvent",
            "textMessageDetails": {
                "messageText": messageText
            }
        }
    }))
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube send message HTTP {}: {}",
      status, error_text
    ));
  }

  response.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn youtubeDeleteMessage(
  messageId: String,
  accessToken: String,
) -> Result<String, String> {
  let client = reqwest::Client::new();
  let response = client
    .delete(format!(
      "https://www.googleapis.com/youtube/v3/liveChat/messages?id={}",
      messageId
    ))
    .header("Authorization", format!("Bearer {}", accessToken))
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    return Err(format!(
      "YouTube delete message HTTP {}: {}",
      status, error_text
    ));
  }

  response.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn youtubeGetLiveVideoId(channelHandle: String) -> Result<String, String> {
  let client = reqwest::Client::new();

  let search_url = if channelHandle.starts_with("@") {
    format!(
      "https://www.googleapis.com/youtube/v3/channels?part=id&forHandle={}",
      channelHandle.trim_start_matches("@")
    )
  } else if channelHandle.len() == 24 && channelHandle.starts_with("UC") {
    format!(
      "https://www.googleapis.com/youtube/v3/channels?part=id&id={}",
      channelHandle
    )
  } else {
    format!(
      "https://www.googleapis.com/youtube/v3/channels?part=id&forHandle={}",
      channelHandle
    )
  };

  let response = client
    .get(&search_url)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!("YouTube channel lookup HTTP {}", response.status()));
  }

  let channel_body: YouTubeChannelResponse = response.json().await.map_err(|e| e.to_string())?;
  let channel_id = channel_body
    .items
    .and_then(|items| items.into_iter().next())
    .and_then(|item| item.id)
    .ok_or("Channel not found")?;

  let search_response = client
    .get(format!(
      "https://www.googleapis.com/youtube/v3/search?part=id&channelId={}&eventType=live&type=video",
      channel_id
    ))
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !search_response.status().is_success() {
    return Err(format!("YouTube search HTTP {}", search_response.status()));
  }

  #[derive(Deserialize)]
  struct YouTubeSearchResponse {
    items: Option<Vec<YouTubeSearchItem>>,
  }

  #[derive(Deserialize)]
  struct YouTubeSearchItem {
    id: Option<YouTubeVideoId>,
  }

  #[derive(Deserialize)]
  struct YouTubeVideoId {
    video_id: Option<String>,
  }

  let search_body: YouTubeSearchResponse =
    search_response.json().await.map_err(|e| e.to_string())?;
  Ok(
    search_body
      .items
      .and_then(|items| items.into_iter().next())
      .and_then(|item| item.id)
      .and_then(|id| id.video_id)
      .unwrap_or_default(),
  )
}

#[tauri::command]
pub async fn youtubeFetchChatMessages(
  videoId: String,
  pageToken: Option<String>,
) -> Result<String, String> {
  let client = reqwest::Client::new();

  let live_chat_id = youtube_fetch_live_chat_id_internal(&client, &videoId).await?;

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
