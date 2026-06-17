use crate::services::twitch::{TwitchChannelEmoteModel, TwitchService};
use crate::AppState;

#[tauri::command]
pub async fn twitch_delete_message(
  state: tauri::State<'_, AppState>,
  channel_id: String,
  message_id: String,
  access_token: String,
) -> Result<bool, String> {
  TwitchService::delete_message(&state, channel_id, message_id, access_token).await
}

#[tauri::command]
pub async fn twitch_fetch_channel_emotes(
  state: tauri::State<'_, AppState>,
  room_id: String,
) -> Result<Vec<TwitchChannelEmoteModel>, String> {
  TwitchService::fetch_channel_emotes(&state, room_id).await
}
