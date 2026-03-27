use tauri::State;

use crate::models::auth_account_model::AuthCommandResultModel;
use crate::models::provider_contract_model::PlatformTypeModel;
use crate::AppState;

#[tauri::command]
pub async fn authStart(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let authUrl = state.oauthProviderService.startAuth(platform)?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization URL prepared.".to_string(),
    auth_url: Some(authUrl),
    account: None,
  })
}

#[tauri::command]
pub async fn authComplete(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
  callbackUrl: String,
) -> Result<AuthCommandResultModel, String> {
  let account = state
    .oauthProviderService
    .completeAuth(platform, callbackUrl)
    .await?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization completed and account saved.".to_string(),
    auth_url: None,
    account: Some(account),
  })
}

#[tauri::command]
pub async fn authAwaitCallback(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let account = state
    .oauthProviderService
    .awaitLoopbackAndComplete(platform)
    .await?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization callback received and account saved.".to_string(),
    auth_url: None,
    account: Some(account),
  })
}

#[tauri::command]
pub async fn authStatus(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let account = state.oauthProviderService.getAuthStatus(platform)?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization status loaded.".to_string(),
    auth_url: None,
    account,
  })
}

#[tauri::command]
pub async fn authDisconnect(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  state.oauthProviderService.disconnect(platform).await?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization disconnected.".to_string(),
    auth_url: None,
    account: None,
  })
}
