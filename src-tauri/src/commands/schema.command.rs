use crate::Response;
use serde_json::Value;

pub const EMBEDDED_SCHEMA: &str = include_str!("../assets/unichat-schema.json");

pub async fn seed_schema_if_needed(
  json_provider: &crate::repositories::data_repository::DataProvider,
) -> Result<(), String> {
  let existing = json_provider
    .find_by_id("schemas", "unichat-schema")
    .await
    .map_err(|e| e.to_string())?;

  if existing.is_some() {
    return Ok(());
  }

  let schema_value: Value = serde_json::from_str(EMBEDDED_SCHEMA)
    .map_err(|e| format!("Failed to parse embedded schema: {}", e))?;

  let data = serde_json::json!({
    "_id": "unichat-schema",
    "name": schema_value.get("app").and_then(|v| v.get("name")).unwrap_or(&serde_json::Value::String("UniChat".to_string())),
    "version": schema_value.get("app").and_then(|v| v.get("version")).unwrap_or(&serde_json::Value::String("1.0.0".to_string())),
    "pages": schema_value.get("pages").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    "layouts": schema_value.get("layouts").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    "components": schema_value.get("components").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    "metadata": schema_value.get("app").cloned().unwrap_or(serde_json::Value::Null),
  });

  json_provider
    .insert("schemas", data)
    .await
    .map_err(|e| e.to_string())?;

  Ok(())
}

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
