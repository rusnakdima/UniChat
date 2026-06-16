use crate::crud_create;
use crate::crud_delete;
use crate::crud_get_by_id;
use crate::crud_get_many;
use crate::crud_patch;
use crate::crud_update;

crud_get_by_id!(get_chat_account, "chat_accounts");
crud_get_many!(get_chat_accounts, "chat_accounts");
crud_create!(create_chat_account, "chat_accounts");
crud_update!(update_chat_account, "chat_accounts");
crud_patch!(patch_chat_account, "chat_accounts");
crud_delete!(delete_chat_account, "chat_accounts");

#[tauri::command]
pub async fn get_chat_account_by_platform_and_user(
  state: tauri::State<'_, crate::AppState>,
  platform: String,
  user_id: String,
) -> Result<crate::entities::response_entity::ResponseModel, String> {
  use crate::entities::response_entity::ResponseModel;
  use nosql_orm::query::Filter;

  let filter = serde_json::json!({
    "platform": platform,
    "user_id": user_id
  });

  let filter_obj = Filter::from_json(&filter).map_err(|e| e.to_string())?;

  let docs = state
    .data
    .json_provider
    .find_many(
      "chat_accounts",
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
      .map(|doc| ResponseModel::success_with_data("Found", doc.clone()))
      .unwrap_or_else(|| ResponseModel::error("Account not found")),
  )
}

#[tauri::command]
pub async fn get_chat_accounts_by_platform(
  state: tauri::State<'_, crate::AppState>,
  platform: String,
) -> Result<crate::entities::response_entity::ResponseModel, String> {
  use crate::entities::response_entity::ResponseModel;
  use nosql_orm::query::Filter;

  let filter = serde_json::json!({
    "platform": platform
  });

  let filter_obj = Filter::from_json(&filter).map_err(|e| e.to_string())?;

  let docs = state
    .data
    .json_provider
    .find_many(
      "chat_accounts",
      Some(&filter_obj),
      None,
      None,
      Some("created_at"),
      false,
    )
    .await
    .map_err(|e| e.to_string())?;

  Ok(ResponseModel::success_with_data(
    &format!("Found {} accounts", docs.len()),
    serde_json::json!(docs),
  ))
}
