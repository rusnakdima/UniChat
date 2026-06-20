use crate::errors::app_error::AppError;
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::query::Filter;
use serde_json::Value;
use std::sync::Arc;
#[derive(Clone)]
pub enum DataProvider {
  Json(Arc<JsonProvider>),
}
impl DataProvider {
  pub async fn find_many(
    &self,
    table: &str,
    filter: Option<&Filter>,
    skip: Option<u64>,
    limit: Option<u64>,
    sort_by: Option<&str>,
    sort_asc: bool,
  ) -> Result<Vec<Value>, AppError> {
    match self {
      DataProvider::Json(p) => {
        DatabaseProvider::find_many(p.as_ref(), table, filter, skip, limit, sort_by, sort_asc)
          .await
          .map_err(|e| AppError::Database(format!("Query failed: {}", e)))
      }
    }
  }
  pub async fn find_by_id(&self, table: &str, id: &str) -> Result<Option<Value>, AppError> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::find_by_id(p.as_ref(), table, id)
        .await
        .map_err(|e| AppError::Database(format!("Query failed: {}", e))),
    }
  }
  pub async fn insert(&self, table: &str, data: Value) -> Result<Value, AppError> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::insert(p.as_ref(), table, data)
        .await
        .map_err(|e| AppError::Database(format!("Create failed: {}", e))),
    }
  }
  pub async fn update(&self, table: &str, id: &str, data: Value) -> Result<Value, AppError> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::update(p.as_ref(), table, id, data)
        .await
        .map_err(|e| AppError::Database(format!("Update failed: {}", e))),
    }
  }
  pub async fn patch(&self, table: &str, id: &str, data: Value) -> Result<Value, AppError> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::patch(p.as_ref(), table, id, data)
        .await
        .map_err(|e| AppError::Database(format!("Patch failed: {}", e))),
    }
  }
  pub async fn delete(&self, table: &str, id: &str) -> Result<bool, AppError> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::delete(p.as_ref(), table, id)
        .await
        .map_err(|e| AppError::Database(format!("Delete failed: {}", e))),
    }
  }
  pub async fn count(&self, table: &str, filter: Option<&Filter>) -> Result<u64, AppError> {
    match self {
      DataProvider::Json(p) => DatabaseProvider::count(p.as_ref(), table, filter)
        .await
        .map_err(|e| AppError::Database(format!("Count failed: {}", e))),
    }
  }
}
