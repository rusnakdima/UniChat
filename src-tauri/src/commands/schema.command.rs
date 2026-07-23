use crate::providers::DbProvider;
use crate::DatabaseProvider;
use crate::Response;
use serde_json::Value;

#[tauri::command]
pub async fn get_schema(
  state: tauri::State<'_, crate::AppState>,
  id: String,
) -> Result<crate::Response<serde_json::Value>, String> {
  let data = state
    .data
    .json_provider
    .find_by_id("schemas", &id)
    .await
    .map_err(|e| e.to_string())?;
  match data {
    Some(schema) => Ok(Response::success(schema, Some("Schema found"))),
    None => Ok(Response::error("Schema not found")),
  }
}

#[tauri::command]
pub async fn save_schema(
  state: tauri::State<'_, crate::AppState>,
  id: String,
  name: String,
  version: String,
  pages: Value,
  layouts: Value,
  components: Value,
  metadata: Value,
) -> Result<crate::Response<serde_json::Value>, String> {
  let data = serde_json::json!({
    "id": id.clone(),
    "name": name,
    "version": version,
    "pages": pages,
    "layouts": layouts,
    "components": components,
    "metadata": metadata,
  });

  if state
    .data
    .json_provider
    .find_by_id("schemas", &id)
    .await
    .map_err(|e| e.to_string())?
    .is_some()
  {
    state
      .data
      .json_provider
      .update("schemas", &id, data)
      .await
      .map_err(|e| e.to_string())?;
    Ok(Response::success(
      serde_json::json!({ "id": id }),
      Some("Schema updated"),
    ))
  } else {
    state
      .data
      .json_provider
      .insert("schemas", data)
      .await
      .map_err(|e| e.to_string())?;
    Ok(Response::success(
      serde_json::json!({ "id": id }),
      Some("Schema created"),
    ))
  }
}

#[tauri::command]
pub async fn get_all_schemas(
  state: tauri::State<'_, crate::AppState>,
) -> Result<crate::Response<serde_json::Value>, String> {
  let schemas = state
    .data
    .json_provider
    .find_many("schemas", None, None, None, None, false)
    .await
    .map_err(|e| e.to_string())?;
  Ok(Response::success(
    serde_json::json!({ "schemas": schemas }),
    Some(&format!("Found {} schemas", schemas.len())),
  ))
}

#[tauri::command]
pub async fn delete_schema(
  state: tauri::State<'_, crate::AppState>,
  id: String,
) -> Result<crate::Response<serde_json::Value>, String> {
  state
    .data
    .json_provider
    .delete("schemas", &id)
    .await
    .map_err(|e| e.to_string())?;
  Ok(Response::success(
    serde_json::json!({ "id": id }),
    Some("Schema deleted"),
  ))
}
