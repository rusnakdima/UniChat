use tauri::State;

use crate::models::auth_account_model::AuthCommandResultModel;
use crate::models::provider_contract_model::PlatformTypeModel;
use crate::AppState;

#[tauri::command]
pub async fn authStart(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let authUrl = state.oauthProviderService.start_auth(platform)?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization URL prepared.".to_string(),
    auth_url: Some(authUrl),
    account: None,
    accounts: None,
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
    .complete_auth(platform, callbackUrl)
    .await?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization completed and account saved.".to_string(),
    auth_url: None,
    account: Some(account),
    accounts: None,
  })
}

#[tauri::command]
pub async fn authAwaitCallback(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let account = state
    .oauthProviderService
    .await_loopback_and_complete(platform)
    .await?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization callback received and account saved.".to_string(),
    auth_url: None,
    account: Some(account),
    accounts: None,
  })
}

#[tauri::command]
pub async fn authStatus(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let accounts = state.oauthProviderService.get_auth_status(platform)?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization status loaded.".to_string(),
    auth_url: None,
    account: None,
    accounts: Some(accounts),
  })
}

#[tauri::command]
pub async fn authDisconnect(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
  accountId: String,
) -> Result<AuthCommandResultModel, String> {
  state
    .oauthProviderService
    .disconnect(platform, accountId)
    .await?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization disconnected.".to_string(),
    auth_url: None,
    account: None,
    accounts: None,
  })
}
