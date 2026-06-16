use crate::crud_create;
use crate::crud_delete;
use crate::crud_get_by_id;
use crate::crud_get_many;
use crate::crud_patch;
use crate::crud_update;

crud_get_by_id!(get_chat_message, "chat_messages");
crud_get_many!(get_chat_messages, "chat_messages");
crud_create!(create_chat_message, "chat_messages");
crud_update!(update_chat_message, "chat_messages");
crud_patch!(patch_chat_message, "chat_messages");
crud_delete!(delete_chat_message, "chat_messages");

#[tauri::command]
pub async fn get_chat_messages_by_channel(
  state: tauri::State<'_, crate::AppState>,
  platform: String,
  source_channel_id: String,
  skip: Option<u64>,
  limit: Option<u64>,
) -> Result<crate::entities::response_entity::ResponseModel, String> {
  use crate::entities::response_entity::ResponseModel;
  use nosql_orm::query::Filter;

  let filter = serde_json::json!({
    "platform": platform,
    "source_channel_id": source_channel_id
  });

  let filter_obj = Filter::from_json(&filter).map_err(|e| e.to_string())?;

  let docs = state
    .data
    .json_provider
    .find_many(
      "chat_messages",
      Some(&filter_obj),
      skip,
      limit,
      Some("created_at"),
      true,
    )
    .await
    .map_err(|e| e.to_string())?;

  Ok(ResponseModel::success_with_data(
    &format!("Found {} messages", docs.len()),
    serde_json::json!(docs),
  ))
}

#[tauri::command]
pub async fn delete_chat_messages_by_channel(
  state: tauri::State<'_, crate::AppState>,
  platform: String,
  source_channel_id: String,
) -> Result<crate::entities::response_entity::ResponseModel, String> {
  use crate::entities::response_entity::ResponseModel;
  use nosql_orm::query::Filter;

  let filter = serde_json::json!({
    "platform": platform,
    "source_channel_id": source_channel_id
  });

  let filter_obj = Filter::from_json(&filter).map_err(|e| e.to_string())?;

  let docs = state
    .data
    .json_provider
    .find_many("chat_messages", Some(&filter_obj), None, None, None, true)
    .await
    .map_err(|e| e.to_string())?;

  let mut deleted_count = 0;
  for doc in docs {
    if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
      if state
        .data
        .json_provider
        .delete("chat_messages", id)
        .await
        .is_ok()
      {
        deleted_count += 1;
      }
    }
  }

  Ok(ResponseModel::success_with_data(
    &format!("Deleted {} messages", deleted_count),
    serde_json::json!({ "deleted_count": deleted_count }),
  ))
}
