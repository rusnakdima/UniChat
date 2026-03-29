use serde::Deserialize;

use crate::constants::KICK_USER_AGENT;

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

#[tauri::command]
pub async fn kickFetchChatroomId(channelSlug: String) -> Result<i64, String> {
  // Kick's API requires authentication for server-side requests.
  // We use the frontend's browser context to make the request, which has fewer restrictions.
  // This command is now a fallback - the frontend will try to fetch directly first.

  let client = reqwest::Client::builder()
    .user_agent(KICK_USER_AGENT)
    .build()
    .map_err(|e| e.to_string())?;

  let url = format!("https://kick.com/api/v1/channels/{}", channelSlug);

  let response = client
    .get(&url)
    .header("Accept", "application/json, text/plain, */*")
    .header("Referer", "https://kick.com/")
    .send()
    .await
    .map_err(|e| format!("Network error: {}", e))?;

  let status = response.status();

  if status == 404 {
    return Err(format!("Channel '{}' not found on Kick", channelSlug));
  } else if status == 401 || status == 403 {
    return Err(format!(
      "Kick API returned {}. Authentication may be required.",
      status
    ));
  } else if !status.is_success() {
    return Err(format!("Kick API error: {}", status));
  }

  let data = response
    .json::<KickChannelResponse>()
    .await
    .map_err(|e| format!("Failed to parse response: {}", e))?;

  // Try to get chatroom ID from the response
  let chatroom_id = data
    .chatroom
    .and_then(|c| c.id)
    .or(data.id)
    .ok_or("Chatroom ID not found in response".to_string())?;

  Ok(chatroom_id)
}

#[tauri::command]
pub async fn kickFetchUserInfo(username: String) -> Result<KickUserInfo, String> {
  let client = reqwest::Client::builder()
    .user_agent(KICK_USER_AGENT)
    .build()
    .map_err(|e| e.to_string())?;

  let url = format!("https://kick.com/api/v2/channels/{}", username);

  let response = client
    .get(&url)
    .header("Accept", "application/json, text/plain, */*")
    .header("Referer", "https://kick.com/")
    .send()
    .await
    .map_err(|e| e.to_string())?;

  let status = response.status();

  if status == 404 {
    return Err("User not found".to_string());
  } else if !status.is_success() {
    return Err(format!("Kick API error: {}", status));
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
pub async fn kickFetchRecentMessages(
  channelSlug: String,
  chatroomId: i64,
) -> Result<String, String> {
  let client = reqwest::Client::builder()
    .user_agent(KICK_USER_AGENT)
    .build()
    .map_err(|e| e.to_string())?;

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

    if let Ok(body) = response.text().await {
      if !body.trim().is_empty() {
        return Ok(body);
      }
    }
  }

  Ok("[]".to_string())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct KickUserInfo {
  pub id: String,
  pub username: String,
  pub bio: String,
  pub profile_pic_url: String,
}
