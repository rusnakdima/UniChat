use crate::services::kick_service::{
  KickChannelInfo, KickChannelInfoWithImage, KickService, KickUserInfo,
};

#[tauri::command]
pub async fn kickFetchChatroomId(
  channelSlug: String,
  accessToken: Option<String>,
) -> Result<KickChannelInfo, String> {
  KickService::fetch_chatroom_id(channelSlug, accessToken).await
}

#[tauri::command]
pub async fn kickFetchUserInfo(username: String) -> Result<KickUserInfo, String> {
  KickService::fetch_user_info(username).await
}

#[tauri::command]
pub async fn kickFetchChannelInfo(channelSlug: String) -> Result<KickChannelInfoWithImage, String> {
  KickService::fetch_channel_info(channelSlug).await
}
