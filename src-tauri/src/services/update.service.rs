#[path = "update-api.service.rs"]
pub mod update_api;
#[path = "update-downloader.service.rs"]
pub mod update_downloader;
#[path = "update-installer.service.rs"]
pub mod update_installer;
#[path = "update-models.service.rs"]
pub mod update_models;
#[path = "update-platform.service.rs"]
pub mod update_platform;
pub use update_api::{check_for_update, find_platform_asset, has_matching_extension};
pub use update_downloader::{download_update_with_progress, get_temp_download_path};
pub use update_installer::install_update;
pub use update_models::{DownloadProgress, GitHubAsset, GitHubRelease, UpdateInfo};
pub use update_platform::Platform;
