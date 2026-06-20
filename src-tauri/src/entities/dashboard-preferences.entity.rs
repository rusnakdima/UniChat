/* sys lib */
use serde::{Deserialize, Serialize};
/* nosql_orm */
use nosql_orm::{Model, Validate};
#[derive(Debug, Clone, Serialize, Deserialize, Model, Validate)]
#[table_name("dashboard_preferences")]
pub struct DashboardPreferencesEntity {
  pub id: Option<String>,
  #[validate(required)]
  pub feed_mode: String,
  #[validate(required)]
  pub density_mode: String,
  #[serde(default)]
  pub auto_scroll: bool,
  #[serde(default)]
  pub split_layout: serde_json::Value,
  #[serde(default)]
  pub mixed_enabled_channel_ids: Vec<String>,
}
impl Default for DashboardPreferencesEntity {
  fn default() -> Self {
    DashboardPreferencesEntity {
      id: None,
      feed_mode: "mixed".to_string(),
      density_mode: "comfortable".to_string(),
      auto_scroll: true,
      split_layout: serde_json::json!({
        "orderedPlatforms": ["twitch", "kick", "youtube"],
        "hiddenPlatforms": [],
        "columnWidths": {
          "twitch": 33,
          "kick": 33,
          "youtube": 34
        }
      }),
      mixed_enabled_channel_ids: vec![],
    }
  }
}
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct DashboardPreferencesUpdateModel {
  #[serde(default)]
  pub feed_mode: Option<String>,
  #[serde(default)]
  pub density_mode: Option<String>,
  #[serde(default)]
  pub auto_scroll: Option<bool>,
  #[serde(default)]
  pub split_layout: Option<serde_json::Value>,
  #[serde(default)]
  pub mixed_enabled_channel_ids: Option<Vec<String>>,
}
