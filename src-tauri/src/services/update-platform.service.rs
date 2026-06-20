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
