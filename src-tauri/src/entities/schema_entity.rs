/* UniChat UI schema entity for JSON DB storage */
use nosql_orm::{Model, Validate};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Model, Validate)]
#[table_name("schemas")]
pub struct SchemaEntity {
  pub id: Option<String>,
  pub name: String,
  pub version: String,
  #[serde(default)]
  pub pages: serde_json::Value,
  #[serde(default)]
  pub layouts: serde_json::Value,
  #[serde(default)]
  pub components: serde_json::Value,
  #[serde(default)]
  pub metadata: serde_json::Value,
}
