use super::youtube_api_auth::api_error;
use crate::utils::http_client::shared_client;
#[derive(Debug, serde::Deserialize)]
pub struct YouTubeLiveChatMessagesResponse {
  pub items: Option<Vec<YouTubeLiveChatMessage>>,
  #[serde(rename = "nextPageToken")]
  pub next_page_token: Option<String>,
  #[serde(rename = "pollingIntervalMillis")]
  pub polling_interval_millis: Option<u64>,
}
#[derive(Debug, serde::Deserialize)]
pub struct YouTubeLiveChatMessage {
  pub id: String,
  pub snippet: Option<YouTubeChatSnippet>,
  #[serde(rename = "authorDetails")]
  pub author_details: Option<YouTubeAuthorDetails>,
}
#[derive(Debug, serde::Deserialize)]
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
#[derive(Debug, serde::Deserialize)]
pub struct YouTubeTextMessageDetails {
  #[serde(rename = "messageText")]
  pub message_text: Option<String>,
}
#[derive(Debug, serde::Deserialize)]
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
pub async fn youtube_fetch_live_chat_messages_by_api_key(
  live_chat_id: &str,
  api_key: &str,
  page_token: Option<&str>,
) -> Result<String, String> {
  let client = shared_client();
  let mut url = format!(
    "https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet,authorDetails&maxResults={}&liveChatId={}&key={}",
    crate::constants::MAX_LIVE_CHAT_RESULTS, live_chat_id, api_key
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
    return Err(api_error(
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
