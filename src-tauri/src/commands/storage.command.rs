use crate::entities::response_entity::Response;
use nosql_orm::query::Filter;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::RwLock;
use tauri::State;

pub struct StorageState {
  data: RwLock<HashMap<String, Value>>,
}

impl StorageState {
  pub fn new() -> Self {
    Self {
      data: RwLock::new(HashMap::new()),
    }
  }
}

#[tauri::command]
pub async fn storage_get(state: State<'_, StorageState>, key: String) -> Result<Response, String> {
  let data = state.data.read().map_err(|e| e.to_string())?;
  match data.get(&key) {
    Some(value) => Ok(Response::success_with_data("Found", value.clone())),
    None => Ok(Response::error("Key not found".to_string())),
  }
}

#[tauri::command]
pub async fn storage_set(
  state: State<'_, StorageState>,
  key: String,
  value: Value,
) -> Result<Response, String> {
  let mut data = state.data.write().map_err(|e| e.to_string())?;
  data.insert(key.clone(), value.clone());
  Ok(Response::success_with_data(
    "Stored",
    serde_json::json!({ "key": key, "value": value }),
  ))
}

#[tauri::command]
pub async fn storage_remove(
  state: State<'_, StorageState>,
  key: String,
) -> Result<Response, String> {
  let mut data = state.data.write().map_err(|e| e.to_string())?;
  data.remove(&key);
  Ok(Response::success_with_data(
    "Removed",
    serde_json::json!({ "key": key }),
  ))
}

#[tauri::command]
pub async fn storage_clear(state: State<'_, StorageState>) -> Result<Response, String> {
  let mut data = state.data.write().map_err(|e| e.to_string())?;
  data.clear();
  Ok(Response::success_with_data(
    "Cleared",
    serde_json::json!({}),
  ))
}

#[tauri::command]
pub async fn storage_keys(state: State<'_, StorageState>) -> Result<Response, String> {
  let data = state.data.read().map_err(|e| e.to_string())?;
  let keys: Vec<String> = data.keys().cloned().collect();
  Ok(Response::success_with_data(
    "Keys retrieved",
    serde_json::json!({ "keys": keys }),
  ))
}

#[tauri::command]
pub async fn query_storage(
  state: tauri::State<'_, crate::AppState>,
  entity_type: String,
  filter: Option<Value>,
  skip: Option<u64>,
  limit: Option<u64>,
  order_by: Option<String>,
  order_direction: Option<String>,
) -> Result<Response, String> {
  let filter_obj = filter
    .as_ref()
    .map(|f| Filter::from_json(f).map_err(|e| e.to_string()))
    .transpose()?;

  let sort_asc = order_direction.as_deref().unwrap_or("desc") == "asc";

  let docs = state
    .data
    .json_provider
    .find_many(
      &entity_type,
      filter_obj.as_ref(),
      skip,
      limit,
      order_by.as_deref(),
      sort_asc,
    )
    .await
    .map_err(|e| e.to_string())?;

  let total = state
    .data
    .json_provider
    .count(&entity_type, filter_obj.as_ref())
    .await
    .map_err(|e| e.to_string())?;

  let has_more = (skip.unwrap_or(0) + docs.len() as u64) < total;

  Ok(Response::success_with_data(
    &format!("Found {} items", docs.len()),
    serde_json::json!({
        "data": docs,
        "total": total,
        "hasMore": has_more
    }),
  ))
}

#[tauri::command]
pub async fn count_storage(
  state: tauri::State<'_, crate::AppState>,
  entity_type: String,
  filter: Option<Value>,
) -> Result<Response, String> {
  let filter_obj = filter
    .as_ref()
    .map(|f| Filter::from_json(f).map_err(|e| e.to_string()))
    .transpose()?;

  let count = state
    .data
    .json_provider
    .count(&entity_type, filter_obj.as_ref())
    .await
    .map_err(|e| e.to_string())?;

  Ok(Response::success_with_data(
    &format!("Count: {}", count),
    serde_json::json!({ "count": count }),
  ))
}

#[tauri::command]
pub async fn exists_storage(
  state: tauri::State<'_, crate::AppState>,
  entity_type: String,
  id: String,
) -> Result<Response, String> {
  let exists = state
    .data
    .json_provider
    .find_by_id(&entity_type, &id)
    .await
    .map_err(|e| e.to_string())?
    .is_some();

  Ok(Response::success_with_data(
    if exists { "Exists" } else { "Not found" },
    serde_json::json!({ "exists": exists }),
  ))
}
