use crate::crud_create;
use crate::crud_delete;
use crate::crud_get_by_id;
use crate::crud_get_many;
use crate::crud_patch;
use crate::crud_update;
use crate::entities::response_entity::ResponseModel;

crud_get_by_id!(get_dashboard_preferences, "dashboard_preferences");
crud_get_many!(get_dashboard_preferences_list, "dashboard_preferences");
crud_create!(create_dashboard_preferences, "dashboard_preferences");
crud_update!(update_dashboard_preferences, "dashboard_preferences");
crud_patch!(patch_dashboard_preferences, "dashboard_preferences");
crud_delete!(delete_dashboard_preferences, "dashboard_preferences");

#[tauri::command]
pub async fn get_or_create_dashboard_preferences(
  state: tauri::State<'_, crate::AppState>,
  user_id: String,
) -> Result<ResponseModel, String> {
  use nosql_orm::query::Filter;

  let filter = serde_json::json!({
    "id": user_id
  });

  let filter_obj = Filter::from_json(&filter).map_err(|e| e.to_string())?;

  let docs = state
    .data
    .json_provider
    .find_many(
      "dashboard_preferences",
      Some(&filter_obj),
      None,
      Some(1),
      None,
      true,
    )
    .await
    .map_err(|e| e.to_string())?;

  if let Some(doc) = docs.first() {
    return Ok(ResponseModel::success_with_data("Found", doc.clone()));
  }

  let default_prefs = serde_json::json!({
    "id": user_id,
    "feed_mode": "mixed",
    "density_mode": "comfortable",
    "auto_scroll": true,
    "split_layout": {
      "orderedPlatforms": ["twitch", "kick", "youtube"],
      "hiddenPlatforms": [],
      "columnWidths": {
        "twitch": 33,
        "kick": 33,
        "youtube": 34
      }
    },
    "mixed_enabled_channel_ids": []
  });

  let doc = state
    .data
    .json_provider
    .insert("dashboard_preferences", default_prefs)
    .await
    .map_err(|e| e.to_string())?;

  Ok(ResponseModel::success_with_data("Created", doc))
}
