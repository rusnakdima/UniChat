#[macro_export]
macro_rules! crud_get_by_id {
  ($route:ident, $table:expr) => {
    #[tauri::command]
    pub async fn $route(
      state: tauri::State<'_, crate::AppState>,
      id: String,
    ) -> Result<tauri_shared::Response<serde_json::Value>, String> {
      use crate::DatabaseProvider;
      let result = state
        .data
        .json_provider
        .find_by_id($table, &id)
        .await
        .map_err(|e| e.to_string())?
        .map(|doc| tauri_shared::Response::success(doc, Some("Found")))
        .unwrap_or_else(|| tauri_shared::Response::not_found(stringify!($table)));
      Ok(result)
    }
  };
}
#[macro_export]
macro_rules! crud_get_many {
  ($route:ident, $table:expr) => {
    #[tauri::command]
    pub async fn $route(
      state: tauri::State<'_, crate::AppState>,
      filter: Option<serde_json::Value>,
      skip: Option<u64>,
      limit: Option<u64>,
      sort_by: Option<String>,
      sort_asc: Option<bool>,
    ) -> Result<tauri_shared::Response<serde_json::Value>, String> {
      use crate::DatabaseProvider;
      use nosql_orm::query::Filter;
      let filter_obj = filter
        .as_ref()
        .map(|f| Filter::from_json(f).map_err(|e| e.to_string()))
        .transpose()?;
      let docs = state
        .data
        .json_provider
        .find_many(
          $table,
          filter_obj.as_ref(),
          skip,
          limit,
          sort_by.as_deref(),
          sort_asc.unwrap_or(true),
        )
        .await
        .map_err(|e| e.to_string())?;
      Ok(tauri_shared::Response::success(
        serde_json::json!(docs),
        Some(&format!("Found {} items", docs.len())),
      ))
    }
  };
}
#[macro_export]
macro_rules! crud_create {
  ($route:ident, $table:expr) => {
    #[tauri::command]
    pub async fn $route(
      state: tauri::State<'_, crate::AppState>,
      data: serde_json::Value,
    ) -> Result<tauri_shared::Response<serde_json::Value>, String> {
      use crate::DatabaseProvider;
      let doc = state
        .data
        .json_provider
        .insert($table, data)
        .await
        .map_err(|e| e.to_string())?;
      Ok(tauri_shared::Response::success(doc, Some("Created")))
    }
  };
}
#[macro_export]
macro_rules! crud_update {
  ($route:ident, $table:expr) => {
    #[tauri::command]
    pub async fn $route(
      state: tauri::State<'_, crate::AppState>,
      id: String,
      data: serde_json::Value,
    ) -> Result<tauri_shared::Response<serde_json::Value>, String> {
      use crate::DatabaseProvider;
      let doc = state
        .data
        .json_provider
        .update($table, &id, data)
        .await
        .map_err(|e| e.to_string())?;
      Ok(tauri_shared::Response::success(doc, Some("Updated")))
    }
  };
}
#[macro_export]
macro_rules! crud_patch {
  ($route:ident, $table:expr) => {
    #[tauri::command]
    pub async fn $route(
      state: tauri::State<'_, crate::AppState>,
      id: String,
      data: serde_json::Value,
    ) -> Result<tauri_shared::Response<serde_json::Value>, String> {
      use crate::DatabaseProvider;
      let doc = state
        .data
        .json_provider
        .patch($table, &id, data)
        .await
        .map_err(|e| e.to_string())?;
      Ok(tauri_shared::Response::success(doc, Some("Patched")))
    }
  };
}
#[macro_export]
macro_rules! crud_delete {
  ($route:ident, $table:expr) => {
    #[tauri::command]
    pub async fn $route(
      state: tauri::State<'_, crate::AppState>,
      id: String,
    ) -> Result<tauri_shared::Response<serde_json::Value>, String> {
      use crate::DatabaseProvider;
      state
        .data
        .json_provider
        .delete($table, &id)
        .await
        .map_err(|e| e.to_string())?;
      Ok(tauri_shared::Response::success(
        serde_json::json!({ "id": id }),
        Some("Deleted"),
      ))
    }
  };
}
