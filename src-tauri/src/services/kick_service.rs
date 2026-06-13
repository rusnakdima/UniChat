use log;
use serde::{Deserialize, Serialize};

use crate::helpers::http_client::shared_client;
use crate::helpers::http_error_helper::handle_http_error;
use crate::utils::validation::{validate_channel_slug, validate_oauth_token};

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

#[derive(Debug, Serialize)]
pub struct KickChannelInfo {
  pub chatroom_id: i64,
  pub broadcaster_user_id: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct KickUserInfo {
  pub id: String,
  pub username: String,
  pub bio: String,
  pub profile_pic_url: String,
}

#[derive(Debug, serde::Serialize)]
pub struct KickChannelInfoWithImage {
  pub id: i64,
  pub user_id: i64,
  pub username: String,
  pub profile_pic_url: Option<String>,
}

pub struct KickService;

impl KickService {
  pub async fn fetch_chatroom_id(
    channel_slug: String,
    access_token: Option<String>,
  ) -> Result<KickChannelInfo, String> {
    log::info!("Fetching chatroom ID for channel: {}", channel_slug);
    validate_channel_slug(&channel_slug).map_err(|e| {
      log::error!("Invalid channel slug '{}': {}", channel_slug, e);
      format!("Invalid channel slug: {}", e)
    })?;

    if let Some(ref token) = access_token {
      validate_oauth_token(token).map_err(|e| {
        log::error!("Invalid access token: {}", e);
        format!("Invalid access token: {}", e)
      })?;
    }

    let client = shared_client();

    let url = format!("https://kick.com/api/v2/channels/{}", channel_slug);

    let mut request = client
      .get(&url)
      .header("Accept", "application/json, text/plain, */*")
      .header("Referer", "https://kick.com/")
      .header("User-Agent", "UniChat/1.0 (https://github.com/uni-chat)");

    if let Some(token) = &access_token {
      request = request.header("Authorization", format!("Bearer {}", token));
    }

    let response = request.send().await.map_err(|e| {
      log::error!(
        "Network error fetching chatroom ID for '{}': {}",
        channel_slug,
        e
      );
      format!("Network error: {}", e)
    })?;

    let status = response.status();

    if !status.is_success() {
      let context = format!("Channel '{}' on Kick", channel_slug);
      let err = handle_http_error(status, &context).unwrap_err();
      log::error!("{}", &err);
      return Err(err);
    }

    let data = response.json::<KickChannelResponse>().await.map_err(|e| {
      log::error!("JSON parse error for channel '{}': {}", channel_slug, e);
      format!("Failed to parse response: {}", e)
    })?;

    let chatroom_id = data
      .chatroom
      .and_then(|c| c.id)
      .or(data.id)
      .ok_or_else(|| {
        log::error!(
          "Chatroom ID not found in response for channel '{}'",
          channel_slug
        );
        "Chatroom ID not found in response".to_string()
      })?;

    let broadcaster_user_id = data.user.and_then(|u| u.id).ok_or_else(|| {
      log::error!(
        "User ID not found in response for channel '{}'",
        channel_slug
      );
      "User ID not found in response".to_string()
    })?;

    log::info!(
      "Successfully fetched chatroom ID for channel: {}",
      channel_slug
    );
    Ok(KickChannelInfo {
      chatroom_id,
      broadcaster_user_id,
    })
  }

  pub async fn fetch_user_info(username: String) -> Result<KickUserInfo, String> {
    let client = shared_client();

    let url = format!("https://kick.com/api/v2/channels/{}", username);

    let response = client
      .get(&url)
      .header("Accept", "application/json, text/plain, */*")
      .header("Referer", "https://kick.com/")
      .send()
      .await
      .map_err(|e| e.to_string())?;

    let status = response.status();

    if !status.is_success() {
      return Err(handle_http_error(status, "User").unwrap_err());
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

  pub async fn fetch_channel_info(
    channel_slug: String,
  ) -> Result<KickChannelInfoWithImage, String> {
    log::info!("Fetching channel info for: {}", channel_slug);
    let client = shared_client();

    let url = format!("https://kick.com/api/v1/channels/{}", channel_slug);

    let response = client
      .get(&url)
      .header("Accept", "application/json")
      .send()
      .await
      .map_err(|e| {
        log::error!(
          "Network error fetching channel info for '{}': {}",
          channel_slug,
          e
        );
        format!("Network error: {}", e)
      })?;

    let status = response.status();

    if !status.is_success() {
      let context = format!("Channel '{}' on Kick", channel_slug);
      let err = handle_http_error(status, &context).unwrap_err();
      log::error!("{}", &err);
      return Err(err);
    }

    let data = response.json::<KickChannelResponse>().await.map_err(|e| {
      log::error!(
        "JSON parse error for channel info '{}': {}",
        channel_slug,
        e
      );
      format!("Failed to parse response: {}", e)
    })?;

    let user = data.user.ok_or_else(|| {
      log::error!(
        "User data not found in response for channel '{}'",
        channel_slug
      );
      "User info not found in response"
    })?;
    let user_id = user.id.ok_or_else(|| {
      log::error!("User ID not found for channel '{}'", channel_slug);
      "User ID not found"
    })?;
    let username = user.username.unwrap_or_else(|| channel_slug.clone());
    let profile_pic_url = user.profile_pic;

    let channel_id = data
      .chatroom
      .and_then(|c| c.id)
      .or(data.id)
      .ok_or_else(|| {
        log::error!("Channel ID not found in response for '{}'", channel_slug);
        "Channel ID not found in response"
      })?;

    log::info!("Successfully fetched channel info for: {}", channel_slug);
    Ok(KickChannelInfoWithImage {
      id: channel_id,
      user_id,
      username,
      profile_pic_url,
    })
  }
}
