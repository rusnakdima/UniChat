use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
pub fn install_update(installer_path: &str, app_handle: &AppHandle) -> Result<bool, String> {
  let path = std::path::Path::new(installer_path);
  if !path.exists() {
    return Err("Installer file not found".to_string());
  }
  let extension = path
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_lowercase();
  #[cfg(target_os = "windows")]
  {
    if extension == "msi" {
      let shell = app_handle.shell();
      let _child = shell
        .command("msiexec")
        .args(["/i", installer_path])
        .spawn()
        .map_err(|e| format!("Failed to run installer: {}", e))?;
    } else {
      let shell = app_handle.shell();
      let _child = shell
        .command(installer_path)
        .spawn()
        .map_err(|e| format!("Failed to run installer: {}", e))?;
    }
  }
  #[cfg(target_os = "macos")]
  {
    let shell = app_handle.shell();
    let _child = shell
      .command("open")
      .args(["-W", installer_path])
      .spawn()
      .map_err(|e| format!("Failed to open installer: {}", e))?;
  }
  #[cfg(target_os = "linux")]
  {
    let shell = app_handle.shell();
    if extension == "AppImage" {
      let _child = shell
        .command("chmod")
        .args(["+x", installer_path])
        .spawn()
        .map_err(|e| format!("Failed to make executable: {}", e))?;
      let _child = shell
        .command(installer_path)
        .spawn()
        .map_err(|e| format!("Failed to run installer: {}", e))?;
    } else if extension == "deb" {
      let _child = shell
        .command("dpkg")
        .args(["-i", installer_path])
        .spawn()
        .map_err(|e| format!("Failed to install .deb: {}", e))?;
    } else if extension == "rpm" {
      let _child = shell
        .command("rpm")
        .args(["-U", installer_path])
        .spawn()
        .map_err(|e| format!("Failed to install .rpm: {}", e))?;
    } else {
      return Err(format!("Unsupported installer format: {}", extension));
    }
  }
  Ok(true)
}
