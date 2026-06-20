use super::update_models::{GitHubAsset, GitHubRelease, UpdateInfo};
use super::update_platform::Platform;
use crate::utils::http_client::shared_client;
const GITHUB_API_BASE: &str =
  "https://api.github.com/repos/TechCraft-Solutions/UniChat/releases/latest";
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
pub fn find_platform_asset<'a>(
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
pub fn has_matching_extension(name: &str, extensions: &[&str]) -> bool {
  extensions
    .iter()
    .any(|ext| name.ends_with(&format!(".{}", ext)))
}
