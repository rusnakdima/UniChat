use crate::crud_create;
use crate::crud_delete;
use crate::crud_get_by_id;
use crate::crud_get_many;
use crate::crud_patch;
use crate::crud_update;
crud_get_by_id!(get_chat_channel, "chat_channels");
crud_get_many!(get_chat_channels, "chat_channels");
crud_create!(create_chat_channel, "chat_channels");
crud_update!(update_chat_channel, "chat_channels");
crud_patch!(patch_chat_channel, "chat_channels");
crud_delete!(delete_chat_channel, "chat_channels");
#[tauri::command]
pub async fn get_chat_channel_by_platform_and_id(
  state: tauri::State<'_, crate::AppState>,
  platform: String,
  channel_id: String,
) -> Result<crate::entities::response_entity::Response, String> {
  use crate::entities::response_entity::Response;
  use nosql_orm::query::Filter;
  let filter = serde_json::json!({
    "platform": platform,
    "channel_id": channel_id
  });
  let filter_obj = Filter::from_json(&filter).map_err(|e| e.to_string())?;
  let docs = state
    .data
    .json_provider
    .find_many(
      "chat_channels",
      Some(&filter_obj),
      None,
      Some(1),
      None,
      true,
    )
    .await
    .map_err(|e| e.to_string())?;
  Ok(
    docs
      .first()
      .map(|doc| Response::success_with_data("Found", doc.clone()))
      .unwrap_or_else(|| Response::error("Channel not found")),
  )
}
