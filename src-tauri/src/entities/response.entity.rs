/* sys lib */
use serde::{Deserialize, Serialize};

/* nosql_orm */
use nosql_orm::Model;

#[derive(Debug, Clone, Serialize, Deserialize, Model)]
#[table_name("responses")]
pub struct ResponseModel {
  #[serde(default)]
  pub id: Option<String>,
  pub status: bool,
  pub message: String,
  #[serde(default)]
  pub data: serde_json::Value,
}

impl ResponseModel {
  pub fn success(message: &str) -> Self {
    ResponseModel {
      id: None,
      status: true,
      message: message.to_string(),
      data: serde_json::Value::Null,
    }
  }

  pub fn success_with_data(message: &str, data: serde_json::Value) -> Self {
    ResponseModel {
      id: None,
      status: true,
      message: message.to_string(),
      data,
    }
  }

  pub fn error(message: &str) -> Self {
    ResponseModel {
      id: None,
      status: false,
      message: message.to_string(),
      data: serde_json::Value::Null,
    }
  }
}
