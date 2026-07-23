use async_trait::async_trait;
use nosql_orm::prelude::*;
use serde_json::Value;
use std::sync::Arc;

#[derive(Clone)]
pub struct DbProvider(pub Arc<JsonProvider>);

#[async_trait]
impl DatabaseProvider for DbProvider {
  async fn insert(&self, collection: &str, doc: Value) -> OrmResult<Value> {
    DatabaseProvider::insert(self.0.as_ref(), collection, doc).await
  }

  async fn find_by_id(&self, collection: &str, id: &str) -> OrmResult<Option<Value>> {
    DatabaseProvider::find_by_id(self.0.as_ref(), collection, id).await
  }

  async fn find_many(
    &self,
    collection: &str,
    filter: Option<&Filter>,
    skip: Option<u64>,
    limit: Option<u64>,
    sort_by: Option<&str>,
    sort_asc: bool,
  ) -> OrmResult<Vec<Value>> {
    DatabaseProvider::find_many(
      self.0.as_ref(),
      collection,
      filter,
      skip,
      limit,
      sort_by,
      sort_asc,
    )
    .await
  }

  async fn update(&self, collection: &str, id: &str, doc: Value) -> OrmResult<Value> {
    DatabaseProvider::update(self.0.as_ref(), collection, id, doc).await
  }

  async fn patch(&self, collection: &str, id: &str, patch: Value) -> OrmResult<Value> {
    DatabaseProvider::patch(self.0.as_ref(), collection, id, patch).await
  }

  async fn delete(&self, collection: &str, id: &str) -> OrmResult<bool> {
    DatabaseProvider::delete(self.0.as_ref(), collection, id).await
  }

  async fn delete_many(&self, collection: &str, filter: Option<Filter>) -> OrmResult<usize> {
    DatabaseProvider::delete_many(self.0.as_ref(), collection, filter).await
  }

  async fn update_many(
    &self,
    collection: &str,
    filter: Option<Filter>,
    updates: Value,
  ) -> OrmResult<usize> {
    DatabaseProvider::update_many(self.0.as_ref(), collection, filter, updates).await
  }

  async fn count(&self, collection: &str, filter: Option<&Filter>) -> OrmResult<u64> {
    DatabaseProvider::count(self.0.as_ref(), collection, filter).await
  }

  async fn exists(&self, collection: &str, id: &str) -> OrmResult<bool> {
    DatabaseProvider::exists(self.0.as_ref(), collection, id).await
  }

  async fn create_index(&self, collection: &str, index: &NosqlIndex) -> OrmResult<()> {
    DatabaseProvider::create_index(self.0.as_ref(), collection, index).await
  }

  async fn drop_index(&self, collection: &str, index_name: &str) -> OrmResult<()> {
    DatabaseProvider::drop_index(self.0.as_ref(), collection, index_name).await
  }

  async fn list_indexes(&self, collection: &str) -> OrmResult<Vec<IndexInfo>> {
    DatabaseProvider::list_indexes(self.0.as_ref(), collection).await
  }
}
