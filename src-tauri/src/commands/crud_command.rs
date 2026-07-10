use std::sync::Arc;
use tauri::State;
use tauri_shared::crud::service::CrudService;
use tauri_shared::response::Response;

#[tauri::command]
pub async fn crud_execute(
  operation: String,
  entity: String,
  id: Option<String>,
  data: Option<serde_json::Value>,
  filter: Option<serde_json::Value>,
  state: State<'_, Arc<CrudService>>,
) -> Result<Response<serde_json::Value>, String> {
  state
    .execute(&operation, &entity, id.as_deref(), data, filter)
    .await
}
