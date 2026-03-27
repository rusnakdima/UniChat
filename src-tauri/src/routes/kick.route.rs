use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct KickChannelResponse {
  pub data: Option<Vec<KickChannel>>,
}

#[derive(Debug, Deserialize)]
pub struct KickChannel {
  #[serde(rename = "broadcaster_user_id")]
  pub broadcaster_user_id: Option<i64>,
  pub slug: Option<String>,
  pub chatroom: Option<KickChatroom>,
}

#[derive(Debug, Deserialize)]
pub struct KickChatroom {
  pub id: Option<i64>,
}

#[tauri::command]
pub async fn kickFetchChatroomId(channelSlug: String) -> Result<i64, String> {
  let client = reqwest::Client::new();

  let response = client
    .get("https://api.kick.com/public/v1/channels")
    .query(&[("slug", &channelSlug)])
    .header("Accept", "application/json")
    .header("User-Agent", "UniChat/1.0")
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let status = response.status();
    return Err(format!("Kick API error: {}", status));
  }

  let data = response
    .json::<KickChannelResponse>()
    .await
    .map_err(|e| e.to_string())?;

  let channel = data
    .data
    .and_then(|c| c.into_iter().next())
    .ok_or_else(|| "Channel not found".to_string())?;

  let chatroom_id = channel
    .chatroom
    .and_then(|c| c.id)
    .ok_or_else(|| "Chatroom ID not found".to_string())?;

  Ok(chatroom_id)
}
