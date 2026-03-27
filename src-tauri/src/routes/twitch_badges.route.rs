use crate::helpers::oauth_config_helper::getOAuthProviderConfig;
use crate::models::provider_contract_model::PlatformTypeModel;
use serde::Deserialize;

#[derive(Deserialize)]
struct TwitchTokenBody {
  access_token: String,
}

fn twitch_client_credentials() -> Result<(String, String), String> {
  let cfg = getOAuthProviderConfig(&PlatformTypeModel::Twitch)?;
  Ok((cfg.client_id, cfg.client_secret))
}

async fn twitch_app_access_token(client_id: &str, client_secret: &str) -> Result<String, String> {
  let client = reqwest::Client::new();
  let response = client
    .post("https://id.twitch.tv/oauth2/token")
    .form(&[
      ("client_id", client_id),
      ("client_secret", client_secret),
      ("grant_type", "client_credentials"),
    ])
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!("Twitch token HTTP {}", response.status()));
  }

  let body: TwitchTokenBody = response.json().await.map_err(|e| e.to_string())?;
  Ok(body.access_token)
}

/// Global chat badges via Helix (`api.twitch.tv`). Replaces legacy `badges.twitch.tv` which may not
/// resolve on some networks.
#[tauri::command]
pub async fn twitchFetchGlobalBadges() -> Result<String, String> {
  let (client_id, client_secret) = twitch_client_credentials()?;
  let token = twitch_app_access_token(&client_id, &client_secret).await?;
  let client = reqwest::Client::new();
  let response = client
    .get("https://api.twitch.tv/helix/chat/badges/global")
    .header("Client-Id", &client_id)
    .header("Authorization", format!("Bearer {token}"))
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!("Twitch global badges HTTP {}", response.status()));
  }

  response.text().await.map_err(|e| e.to_string())
}

/// Channel-specific chat badges (subscriber, etc.). `broadcaster_id` is the Twitch IRC `room-id`.
#[tauri::command]
pub async fn twitchFetchChannelBadges(broadcasterId: String) -> Result<String, String> {
  if broadcasterId.trim().is_empty() {
    return Err("broadcasterId required".to_string());
  }
  let (client_id, client_secret) = twitch_client_credentials()?;
  let token = twitch_app_access_token(&client_id, &client_secret).await?;
  let client = reqwest::Client::new();
  let response = client
    .get("https://api.twitch.tv/helix/chat/badges")
    .query(&[("broadcaster_id", broadcasterId.as_str())])
    .header("Client-Id", &client_id)
    .header("Authorization", format!("Bearer {token}"))
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!("Twitch channel badges HTTP {}", response.status()));
  }

  response.text().await.map_err(|e| e.to_string())
}
