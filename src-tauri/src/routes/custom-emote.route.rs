use crate::crud_create;
use crate::crud_delete;
use crate::crud_get_by_id;
use crate::crud_get_many;
use crate::crud_patch;
use crate::crud_update;

crud_get_by_id!(get_custom_emote, "custom_emotes");
crud_get_many!(get_custom_emotes, "custom_emotes");
crud_create!(create_custom_emote, "custom_emotes");
crud_update!(update_custom_emote, "custom_emotes");
crud_patch!(patch_custom_emote, "custom_emotes");
crud_delete!(delete_custom_emote, "custom_emotes");

#[tauri::command]
pub async fn get_custom_emotes_by_platform(
  state: tauri::State<'_, crate::AppState>,
  platform: String,
  channel_id: Option<String>,
) -> Result<crate::entities::response_entity::ResponseModel, String> {
  use crate::entities::response_entity::ResponseModel;
  use nosql_orm::query::Filter;

  let filter = if let Some(ch_id) = channel_id {
    serde_json::json!({
      "platform": platform,
      "channel_id": ch_id
    })
  } else {
    serde_json::json!({
      "platform": platform
    })
  };

  let filter_obj = Filter::from_json(&filter).map_err(|e| e.to_string())?;

  let docs = state
    .data
    .json_provider
    .find_many(
      "custom_emotes",
      Some(&filter_obj),
      None,
      None,
      Some("created_at"),
      false,
    )
    .await
    .map_err(|e| e.to_string())?;

  Ok(ResponseModel::success_with_data(
    &format!("Found {} emotes", docs.len()),
    serde_json::json!(docs),
  ))
}
