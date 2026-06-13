use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

use crate::helpers::http_client::shared_client;

const GITHUB_API_BASE: &str =
  "https://api.github.com/repos/TechCraft-Solutions/UniChat/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRelease {
  pub tag_name: String,
  pub name: Option<String>,
  pub body: Option<String>,
  pub assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubAsset {
  pub id: u64,
  pub name: String,
  pub browser_download_url: String,
  pub size: u64,
  pub content_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
  pub current_version: String,
  pub latest_version: String,
  pub download_url: String,
  pub asset_name: String,
  pub asset_size: u64,
  pub release_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
  pub bytes_downloaded: u64,
  pub total_bytes: u64,
  pub progress_percent: f64,
}

pub enum Platform {
  Windows,
  MacOs,
  Linux,
  Android,
}

impl std::fmt::Debug for Platform {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Platform::Windows => write!(f, "Windows"),
      Platform::MacOs => write!(f, "macOS"),
      Platform::Linux => write!(f, "Linux"),
      Platform::Android => write!(f, "Android"),
    }
  }
}

impl Platform {
  pub fn current() -> Self {
    #[cfg(target_os = "windows")]
    return Platform::Windows;
    #[cfg(target_os = "macos")]
    return Platform::MacOs;
    #[cfg(target_os = "linux")]
    return Platform::Linux;
    #[cfg(target_os = "android")]
    return Platform::Android;
  }

  pub fn asset_extensions(&self) -> Vec<&'static str> {
    match self {
      Platform::Windows => vec!["msi", "exe"],
      Platform::MacOs => vec!["dmg", "app.tar.gz"],
      Platform::Linux => vec!["AppImage", "deb", "rpm"],
      Platform::Android => vec!["apk"],
    }
  }

  pub fn asset_name_prefix(&self) -> &'static str {
    match self {
      Platform::Windows => "unichat",
      Platform::MacOs => "unichat",
      Platform::Linux => "unichat",
      Platform::Android => "unichat",
    }
  }
}

pub async fn check_for_update(current_version: &str) -> Result<UpdateInfo, String> {
  let client = shared_client();

  let response = client
    .get(GITHUB_API_BASE)
    .header("Accept", "application/vnd.github+json")
    .header("User-Agent", "UniChat-App")
    .send()
    .await
    .map_err(|e| format!("Failed to fetch release info: {}", e))?;

  if response.status() == 403 {
    return Err("GitHub API rate limit exceeded. Please try again later.".to_string());
  }

  if response.status() == 404 {
    return Err("No releases found.".to_string());
  }

  let release: GitHubRelease = response
    .json()
    .await
    .map_err(|e| format!("Failed to parse release info: {}", e))?;

  let latest_version = release.tag_name.trim_start_matches('v');

  if latest_version == current_version {
    return Err("You are running the latest version.".to_string());
  }

  let platform = Platform::current();

  let asset = find_platform_asset(&release.assets, &platform)
    .ok_or_else(|| format!("No suitable asset found for {:?}", platform))?;

  Ok(UpdateInfo {
    current_version: current_version.to_string(),
    latest_version: latest_version.to_string(),
    download_url: asset.browser_download_url.clone(),
    asset_name: asset.name.clone(),
    asset_size: asset.size,
    release_notes: release.body,
  })
}

fn find_platform_asset<'a>(
  assets: &'a [GitHubAsset],
  platform: &Platform,
) -> Option<&'a GitHubAsset> {
  let extensions = platform.asset_extensions();
  let prefix = platform.asset_name_prefix();

  for asset in assets {
    let name_lower = asset.name.to_lowercase();
    if name_lower.contains(prefix) && has_matching_extension(&name_lower, &extensions) {
      return Some(asset);
    }
  }

  if matches!(platform, Platform::Android) {
    for asset in assets {
      let name_lower = asset.name.to_lowercase();
      if name_lower.contains("app-universal-release")
        && has_matching_extension(&name_lower, &extensions)
      {
        return Some(asset);
      }
    }
  }

  for asset in assets {
    let name_lower = asset.name.to_lowercase();
    if has_matching_extension(&name_lower, &extensions) {
      return Some(asset);
    }
  }

  None
}

fn has_matching_extension(name: &str, extensions: &[&str]) -> bool {
  extensions
    .iter()
    .any(|ext| name.ends_with(&format!(".{}", ext)))
}

pub async fn download_update_with_progress(
  url: &str,
  dest_path: &PathBuf,
  app_handle: AppHandle,
) -> Result<u64, String> {
  let client = shared_client();

  let response = client
    .get(url)
    .header("Accept", "application/octet-stream")
    .header("User-Agent", "UniChat-App")
    .send()
    .await
    .map_err(|e| format!("Failed to start download: {}", e))?;

  if !response.status().is_success() {
    return Err(format!(
      "Download failed with status: {}",
      response.status()
    ));
  }

  let total_bytes = response.content_length().unwrap_or(0);
  let mut dest_file =
    std::fs::File::create(dest_path).map_err(|e| format!("Failed to create file: {}", e))?;
  let mut bytes_downloaded: u64 = 0;

  let mut stream = response.bytes_stream();
  let mut chunk_counter: u64 = 0;

  while let Some(chunk_result) = stream.next().await {
    match chunk_result {
      Ok(chunk) => {
        use std::io::Write;
        dest_file
          .write_all(&chunk)
          .map_err(|e| format!("Failed to write chunk: {}", e))?;
        bytes_downloaded += chunk.len() as u64;
        chunk_counter += 1;

        if chunk_counter.is_multiple_of(100) {
          let progress = if total_bytes > 0 {
            (bytes_downloaded as f64 / total_bytes as f64) * 100.0
          } else {
            0.0
          };

          let _ = app_handle.emit(
            "update-download-progress",
            DownloadProgress {
              bytes_downloaded,
              total_bytes,
              progress_percent: progress,
            },
          );
        }
      }
      Err(e) => {
        log::warn!("Download chunk error: {}", e);
        break;
      }
    }
  }

  let _ = app_handle.emit(
    "update-download-complete",
    &dest_path.to_string_lossy().to_string(),
  );

  Ok(bytes_downloaded)
}

pub fn get_temp_download_path(asset_name: &str) -> Result<PathBuf, String> {
  let temp_dir = std::env::temp_dir();

  let safe_name = asset_name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");

  Ok(temp_dir.join(format!("unichat_update_{}", safe_name)))
}

pub fn install_update(installer_path: &str, app_handle: &tauri::AppHandle) -> Result<bool, String> {
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
