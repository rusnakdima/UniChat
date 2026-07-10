use crate::Response;
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
pub async fn storage_get(
  state: State<'_, StorageState>,
  key: String,
) -> Result<crate::Response<serde_json::Value>, String> {
  let data = state.data.read().map_err(|e| e.to_string())?;
  match data.get(&key) {
    Some(value) => Ok(Response::success(value.clone(), Some("Found"))),
    None => Ok(Response::error("Key not found")),
  }
}
#[tauri::command]
pub async fn storage_set(
  state: State<'_, StorageState>,
  key: String,
  value: Value,
) -> Result<crate::Response<serde_json::Value>, String> {
  let mut data = state.data.write().map_err(|e| e.to_string())?;
  data.insert(key.clone(), value.clone());
  Ok(Response::success(
    serde_json::json!({ "key": key, "value": value }),
    Some("Stored"),
  ))
}
#[tauri::command]
pub async fn storage_remove(
  state: State<'_, StorageState>,
  key: String,
) -> Result<crate::Response<serde_json::Value>, String> {
  let mut data = state.data.write().map_err(|e| e.to_string())?;
  data.remove(&key);
  Ok(Response::success(
    serde_json::json!({ "key": key }),
    Some("Removed"),
  ))
}
#[tauri::command]
pub async fn storage_clear(
  state: State<'_, StorageState>,
) -> Result<crate::Response<serde_json::Value>, String> {
  let mut data = state.data.write().map_err(|e| e.to_string())?;
  data.clear();
  Ok(Response::success(serde_json::json!({}), Some("Cleared")))
}
#[tauri::command]
pub async fn storage_keys(
  state: State<'_, StorageState>,
) -> Result<crate::Response<serde_json::Value>, String> {
  let data = state.data.read().map_err(|e| e.to_string())?;
  let keys: Vec<String> = data.keys().cloned().collect();
  Ok(Response::success(
    serde_json::json!({ "keys": keys }),
    Some("Keys retrieved"),
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
) -> Result<crate::Response<serde_json::Value>, String> {
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
  Ok(Response::success(
    serde_json::json!({
        "data": docs,
        "total": total,
        "hasMore": has_more
    }),
    Some(&format!("Found {} items", docs.len())),
  ))
}
#[tauri::command]
pub async fn count_storage(
  state: tauri::State<'_, crate::AppState>,
  entity_type: String,
  filter: Option<Value>,
) -> Result<crate::Response<serde_json::Value>, String> {
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
  Ok(Response::success(
    serde_json::json!({ "count": count }),
    Some(&format!("Count: {}", count)),
  ))
}
#[tauri::command]
pub async fn exists_storage(
  state: tauri::State<'_, crate::AppState>,
  entity_type: String,
  id: String,
) -> Result<crate::Response<serde_json::Value>, String> {
  let exists = state
    .data
    .json_provider
    .find_by_id(&entity_type, &id)
    .await
    .map_err(|e| e.to_string())?
    .is_some();
  Ok(Response::success(
    serde_json::json!({ "exists": exists }),
    if exists {
      Some("Exists")
    } else {
      Some("Not found")
    },
  ))
}
