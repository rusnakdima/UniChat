use serde::{Deserialize, Serialize};

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
