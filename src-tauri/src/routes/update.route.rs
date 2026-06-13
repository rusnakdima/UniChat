#![allow(non_snake_case)]

use crate::services::update::{
  check_for_update, download_update_with_progress, get_temp_download_path, install_update,
  UpdateInfo,
};
use crate::AppState;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, serde::Serialize)]
pub struct CheckUpdateResult {
  pub has_update: bool,
  pub update_info: Option<UpdateInfo>,
  pub error: Option<String>,
}

#[tauri::command]
pub async fn checkForUpdate(state: State<'_, AppState>) -> Result<CheckUpdateResult, String> {
  let current_version = state.config.version.clone();

  match check_for_update(&current_version).await {
    Ok(update_info) => Ok(CheckUpdateResult {
      has_update: true,
      update_info: Some(update_info),
      error: None,
    }),
    Err(e) => {
      if e.contains("You are running the latest version") {
        Ok(CheckUpdateResult {
          has_update: false,
          update_info: None,
          error: None,
        })
      } else {
        Ok(CheckUpdateResult {
          has_update: false,
          update_info: None,
          error: Some(e),
        })
      }
    }
  }
}

#[tauri::command]
pub async fn downloadUpdate(url: String, app_handle: AppHandle) -> Result<String, String> {
  let url_clone = url.clone();
  let asset_name = url_clone
    .split('/')
    .next_back()
    .unwrap_or("update.bin")
    .to_string();

  let dest_path = get_temp_download_path(&asset_name)?;

  let _downloaded = download_update_with_progress(&url, &dest_path, app_handle).await?;

  Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn installUpdate(installer_path: String, app_handle: AppHandle) -> Result<bool, String> {
  install_update(&installer_path, &app_handle)
}

#[tauri::command]
pub fn getCurrentVersion(state: State<'_, AppState>) -> String {
  state.config.version.clone()
}
