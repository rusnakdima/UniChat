use crate::services::twitch_service::{TwitchChannelEmoteModel, TwitchService};
use crate::AppState;

#[tauri::command]
pub async fn twitchDeleteMessage(
  state: tauri::State<'_, AppState>,
  channel_id: String,
  message_id: String,
  access_token: String,
) -> Result<bool, String> {
  TwitchService::delete_message(&state, channel_id, message_id, access_token).await
}

#[tauri::command]
pub async fn twitchFetchChannelEmotes(
  state: tauri::State<'_, AppState>,
  room_id: String,
) -> Result<Vec<TwitchChannelEmoteModel>, String> {
  TwitchService::fetch_channel_emotes(&state, room_id).await
}
