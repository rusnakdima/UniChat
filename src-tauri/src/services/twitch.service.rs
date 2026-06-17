use crate::{log_debug, log_error, log_info, log_warn};
use serde::{Deserialize, Serialize};

use crate::models::platform_type_model::PlatformTypeModel;
use crate::utils::auth_twitch_helper::{
  normalize_twitch_cdn_url, twitch_app_access_token, twitch_client_credentials,
};
use crate::utils::http_client::shared_client;
use crate::utils::http_error_helper::handle_http_error;
use crate::utils::oauth_config_helper::get_oauth_provider_config;
use crate::AppState;

#[derive(Debug, Deserialize)]
struct HelixEmoteRow {
  id: String,
  name: String,
  images: HelixEmoteImages,
}

#[derive(Debug, Deserialize)]
struct HelixEmoteImages {
  url1x: Option<String>,
  url2x: Option<String>,
  url4x: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelixChannelEmotesResponse {
  data: Option<Vec<HelixEmoteRow>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchChannelEmoteModel {
  pub id: String,
  pub code: String,
  pub url: String,
}

pub struct TwitchService;

impl TwitchService {
  pub async fn delete_message(
    state: &AppState,
    channel_id: String,
    message_id: String,
    access_token: String,
  ) -> Result<bool, String> {
    log_info!("Deleting Twitch message: {}", message_id);
    let client = shared_client();
    let config =
      get_oauth_provider_config(&PlatformTypeModel::Twitch, &state.config).map_err(|e| {
        log_error!("OAuth config error for Twitch: {}", e);
        format!("OAuth config error: {}", e)
      })?;

    let user_info_response = client
      .get("https://api.twitch.tv/helix/users")
      .header("Client-Id", &config.client_id)
      .header("Authorization", format!("Bearer {}", access_token))
      .send()
      .await
      .map_err(|e| {
        log_error!("Network error validating token: {}", e);
        format!("Failed to get user info: {}", e)
      })?;

    if !user_info_response.status().is_success() {
      log_error!(
        "Token validation failed with status: {}",
        user_info_response.status()
      );
      return Err(format!(
        "Token validation failed: {}",
        user_info_response.status()
      ));
    }

    let user_info: serde_json::Value = user_info_response.json().await.map_err(|e| {
      log_error!("JSON parse error for user info: {}", e);
      format!("Failed to parse user info: {}", e)
    })?;

    let user_id = user_info["data"]
      .as_array()
      .and_then(|arr| arr.first())
      .and_then(|user| user["id"].as_str())
      .ok_or_else(|| {
        log_error!("Failed to get user ID from token response");
        "Failed to get user ID from token".to_string()
      })?;

    let url = format!(
      "https://api.twitch.tv/helix/moderation/chat?broadcaster_id={}&message_id={}",
      user_id, message_id
    );

    let response = client
      .delete(&url)
      .header("Client-Id", &config.client_id)
      .header("Authorization", format!("Bearer {}", access_token))
      .send()
      .await
      .map_err(|e| {
        log_error!("Network error deleting message: {}", e);
        format!("Delete request failed: {}", e)
      })?;

    let status = response.status();

    if status.is_success() {
      log_info!("Successfully deleted Twitch message: {}", message_id);
      Ok(true)
    } else if status == 404 {
      log_debug!("Message {} not found, treating as success", message_id);
      Ok(true)
    } else if status == 403 {
      log_warn!(
        "Missing permissions to delete message {} in channel {}",
        message_id,
        channel_id
      );
      Err(
        "Missing permissions: You must be a moderator or broadcaster to delete messages"
          .to_string(),
      )
    } else {
      return Err(handle_http_error(status, "Twitch message delete"));
    }
  }

  pub async fn fetch_channel_emotes(
    state: &AppState,
    room_id: String,
  ) -> Result<Vec<TwitchChannelEmoteModel>, String> {
    if room_id.trim().is_empty() {
      return Err("room_id required".to_string());
    }

    let (client_id, client_secret) = twitch_client_credentials(&state.config)?;
    let token = twitch_app_access_token(&client_id, client_secret.as_deref()).await?;

    let client = shared_client();
    let url = format!(
      "https://api.twitch.tv/helix/chat/emotes?broadcaster_id={}",
      room_id
    );

    let response = client
      .get(&url)
      .header("Client-Id", client_id)
      .header("Authorization", format!("Bearer {token}"))
      .send()
      .await
      .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
      return Err(handle_http_error(response.status(), "Twitch API"));
    }

    let emotes_response: HelixChannelEmotesResponse =
      response.json().await.map_err(|e| e.to_string())?;

    let emotes: Vec<TwitchChannelEmoteModel> = emotes_response
      .data
      .unwrap_or_default()
      .into_iter()
      .filter_map(|row| {
        let url = row.images.url1x.or(row.images.url2x).or(row.images.url4x)?;
        let normalized = normalize_twitch_cdn_url(&Some(url.clone())).unwrap_or(url);
        Some(TwitchChannelEmoteModel {
          id: row.id,
          code: row.name,
          url: normalized,
        })
      })
      .collect();

    log_info!(
      "Fetched {} Twitch channel emotes for room {}",
      emotes.len(),
      room_id
    );
    Ok(emotes)
  }
}
