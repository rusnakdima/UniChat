use log;
use serde::Deserialize;
use serde::Serialize;

use crate::helpers::http_client::shared_client;
use crate::utils::validation::{validate_message_id, validate_oauth_token};

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

#[tauri::command]
pub async fn kickFetchRecentMessages(
  channelSlug: String,
  chatroomId: i64,
) -> Result<String, String> {
  log::info!(
    "Fetching recent messages for chatroom: {} (channel: {})",
    chatroomId,
    channelSlug
  );
  let client = shared_client();

  let url = format!(
    "https://api.kick.com/public/v1/chatrooms/{}/messages",
    chatroomId
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
          log::debug!(
            "Fetched messages from primary endpoint for chatroom {}",
            chatroomId
          );
          return Ok(body);
        }
      }
    }
  }

  let urls = [
    format!("https://kick.com/api/v2/chatrooms/{}/messages", chatroomId),
    format!("https://kick.com/api/v1/chatrooms/{}/messages", chatroomId),
    format!("https://kick.com/api/v2/channels/{}/messages", channelSlug),
  ];

  for url in urls {
    let response = client
      .get(&url)
      .header("Accept", "application/json, text/plain, */*")
      .header("Referer", format!("https://kick.com/{}", channelSlug))
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
      log::debug!(
        "Fetched messages from fallback endpoint for chatroom {}",
        chatroomId
      );
      return Ok(body);
    }
  }

  log::debug!(
    "No messages found for chatroom {}, returning empty array",
    chatroomId
  );
  Ok("[]".to_string())
}

#[tauri::command]
pub async fn kickSendChatMessage(
  _chatroom_id: i64,
  content: String,
  access_token: String,
  broadcaster_user_id: i64,
  reply_to_message_id: Option<String>,
) -> Result<KickSendMessageResponseData, String> {
  log::info!(
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
      log::error!("Network error sending chat message: {}", e);
      format!("Network error: {}", e)
    })?;

  let status = response.status();

  if status == 429 {
    log::warn!(
      "Rate limit exceeded when sending message for broadcaster: {}",
      broadcaster_user_id
    );
    return Err("Rate limit exceeded. Please wait before sending more messages.".to_string());
  }

  if !status.is_success() {
    let error_text = response.text().await.unwrap_or_default();
    log::error!(
      "Kick API error sending message ({}): {}",
      status,
      error_text
    );
    return Err(format!("Kick API error ({}): {}", status, error_text));
  }

  let data = response
    .json::<KickSendMessageResponse>()
    .await
    .map_err(|e| {
      log::error!("JSON parse error for send message response: {}", e);
      format!("Failed to parse response: {}", e)
    })?;

  log::info!(
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
pub async fn kickDeleteChatMessage(
  message_id: String,
  access_token: String,
) -> Result<KickDeleteMessageResponseData, String> {
  log::info!("Deleting chat message: {}", message_id);
  validate_message_id(&message_id).map_err(|e| {
    log::error!("Invalid message ID '{}': {}", message_id, e);
    format!("Invalid message ID: {}", e)
  })?;
  validate_oauth_token(&access_token).map_err(|e| {
    log::error!("Invalid access token for message deletion: {}", e);
    format!("Invalid access token: {}", e)
  })?;

  let client = shared_client();

  let response = client
    .delete(format!("https://api.kick.com/public/v1/chat/{message_id}"))
    .bearer_auth(&access_token)
    .send()
    .await
    .map_err(|e| {
      log::error!("Network error deleting message {}: {}", message_id, e);
      format!("Network error: {e}")
    })?;

  let status = response.status();

  if status == 429 {
    log::warn!("Rate limit exceeded when deleting message: {}", message_id);
    return Err("Rate limit exceeded. Please try again later.".to_string());
  }

  if !status.is_success() {
    let error_text = response.text().await.unwrap_or_default();
    log::error!(
      "Kick API error deleting message {} ({}): {}",
      message_id,
      status,
      error_text
    );
    return Err(format!("Kick API error {}: {}", status, error_text));
  }

  log::info!("Message deleted successfully: {}", message_id);
  Ok(KickDeleteMessageResponseData {
    is_deleted: true,
    message_id,
  })
}
