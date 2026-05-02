use crate::helpers::http_client::shared_client;
use crate::helpers::oauth_config_helper::get_oauth_provider_config;
use crate::models::platform_type_model::PlatformTypeModel;
use crate::AppState;

/// Delete a message from Twitch chat
/// Requires moderator or broadcaster OAuth token
#[tauri::command]
pub async fn twitchDeleteMessage(
  state: tauri::State<'_, AppState>,
  _channel_id: String,
  message_id: String,
  access_token: String,
) -> Result<bool, String> {
  let client = shared_client();
  let config = get_oauth_provider_config(&PlatformTypeModel::Twitch, &state.config)
    .map_err(|e| format!("OAuth config error: {}", e))?;

  // Get user ID from token (we need it for the API call)
  // First, validate the token and get user info
  let user_info_response = client
    .get("https://api.twitch.tv/helix/users")
    .header("Client-Id", &config.client_id)
    .header("Authorization", format!("Bearer {}", access_token))
    .send()
    .await
    .map_err(|e| format!("Failed to get user info: {}", e))?;

  if !user_info_response.status().is_success() {
    return Err(format!(
      "Token validation failed: {}",
      user_info_response.status()
    ));
  }

  let user_info: serde_json::Value = user_info_response
    .json()
    .await
    .map_err(|e| format!("Failed to parse user info: {}", e))?;

  let user_id = user_info["data"]
    .as_array()
    .and_then(|arr| arr.first())
    .and_then(|user| user["id"].as_str())
    .ok_or_else(|| "Failed to get user ID from token".to_string())?;

  // Delete the message
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
    .map_err(|e| format!("Delete request failed: {}", e))?;

  let status = response.status();

  if status.is_success() {
    Ok(true)
  } else if status == 404 {
    // Message already deleted or not found - treat as success
    Ok(true)
  } else if status == 403 {
    Err(
      "Missing permissions: You must be a moderator or broadcaster to delete messages".to_string(),
    )
  } else {
    let error_text = response.text().await.unwrap_or_default();
    Err(format!("Delete failed ({}): {}", status, error_text))
  }
}
