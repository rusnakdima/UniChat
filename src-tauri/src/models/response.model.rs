use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
  Success,
  Info,
  Warning,
  Error,
  Created,
  Updated,
  Deleted,
  ValidationError,
  NotFound,
  Unauthorized,
  Forbidden,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response<T = serde_json::Value> {
  pub status: Status,
  pub message: String,
  pub data: T,
}

impl<T> Response<T> {
  pub fn success(message: impl Into<String>, data: T) -> Self {
    Self {
      status: Status::Success,
      message: message.into(),
      data,
    }
  }

  pub fn error(status: Status, message: impl Into<String>) -> Self
  where
    T: Default,
  {
    Self {
      status,
      message: message.into(),
      data: T::default(),
    }
  }
}

impl<T: Serialize> Response<T> {
  pub fn to_json_value(self) -> serde_json::Value {
    serde_json::to_value(self).unwrap_or_else(|_| {
      serde_json::json!({
          "status": "error",
          "message": "Serialization failed",
          "data": null
      })
    })
  }
}

impl Default for Status {
  fn default() -> Self {
    Status::Success
  }
}
