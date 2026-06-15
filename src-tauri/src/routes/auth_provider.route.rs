use tauri::State;

use crate::models::auth_account_model::AuthCommandResultModel;
use crate::models::platform_type_model::PlatformTypeModel;
use crate::AppState;

#[tauri::command]
pub async fn auth_start(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let auth_url = state
    .account_service
    .start_auth(platform)
    .map_err(|e| e.to_string())?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization URL prepared.".to_string(),
    auth_url: Some(auth_url),
    account: None,
    accounts: None,
  })
}

#[tauri::command]
pub async fn auth_complete(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
  callback_url: String,
) -> Result<AuthCommandResultModel, String> {
  let account = state
    .account_service
    .complete_auth(platform, callback_url)
    .await
    .map_err(|e| e.to_string())?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization completed and account saved.".to_string(),
    auth_url: None,
    account: Some(account),
    accounts: None,
  })
}

#[tauri::command]
pub async fn auth_await_callback(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let account = state
    .account_service
    .await_loopback_and_complete(platform)
    .await
    .map_err(|e| e.to_string())?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization callback received and account saved.".to_string(),
    auth_url: None,
    account: Some(account),
    accounts: None,
  })
}

#[tauri::command]
pub async fn auth_status(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let accounts = state
    .account_service
    .get_auth_status(platform)
    .map_err(|e| e.to_string())?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization status loaded.".to_string(),
    auth_url: None,
    account: None,
    accounts: Some(accounts),
  })
}

#[tauri::command]
pub async fn auth_validate(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
) -> Result<AuthCommandResultModel, String> {
  let accounts = state
    .account_service
    .validate_auth_status(platform)
    .await
    .map_err(|e| e.to_string())?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization validated.".to_string(),
    auth_url: None,
    account: None,
    accounts: Some(accounts),
  })
}

#[tauri::command]
pub async fn auth_refresh(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
  account_id: String,
) -> Result<AuthCommandResultModel, String> {
  let account = state
    .account_service
    .refresh_token(&platform, &account_id)
    .await
    .map_err(|e| e.to_string())?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Token refreshed successfully.".to_string(),
    auth_url: None,
    account: Some(account),
    accounts: None,
  })
}

#[tauri::command]
pub async fn auth_disconnect(
  state: State<'_, AppState>,
  platform: PlatformTypeModel,
  account_id: String,
) -> Result<AuthCommandResultModel, String> {
  state
    .account_service
    .disconnect(platform, account_id)
    .await
    .map_err(|e| e.to_string())?;
  Ok(AuthCommandResultModel {
    success: true,
    message: "Authorization disconnected.".to_string(),
    auth_url: None,
    account: None,
    accounts: None,
  })
}
