use crate::models::overlay_message_model::OverlayMessageModel;
use crate::services::twitch_irc::{TwitchChatMessage, TwitchIrcService};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn twitch_irc_join_channel(
  state: State<'_, AppState>,
  channel_id: String,
  channel_name: String,
  username: String,
  oauth_token: String,
) -> Result<(), String> {
  state
    .twitch_irc_service
    .join_channel(channel_id, channel_name, username, oauth_token)
    .await
}

#[tauri::command]
pub async fn twitch_irc_leave_channel(
  state: State<'_, AppState>,
  channel_id: String,
  channel_name: String,
) -> Result<(), String> {
  state
    .twitch_irc_service
    .leave_channel(channel_id, channel_name)
    .await;
  Ok(())
}

#[tauri::command]
pub async fn twitch_irc_send_message(
  state: State<'_, AppState>,
  channel_id: String,
  channel_name: String,
  message: String,
) -> Result<(), String> {
  state
    .twitch_irc_service
    .send_message(channel_id, channel_name, message)
    .await
}

#[tauri::command]
pub async fn twitch_irc_is_connected(
  state: State<'_, AppState>,
  channel_id: String,
  channel_name: String,
) -> Result<bool, String> {
  Ok(
    state
      .twitch_irc_service
      .is_connected(&channel_id, &channel_name)
      .await,
  )
}
