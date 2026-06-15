use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Status {
  Success,
  Created,
  Updated,
  Deleted,
  Error,
  ValidationError,
  NotFound,
  Unauthorized,
  Forbidden,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Response<T = serde_json::Value> {
  pub status: Status,
  pub message: String,
  pub data: T,
}

impl<T> Response<T> {
  pub fn success(data: T) -> Self {
    Self {
      status: Status::Success,
      message: String::new(),
      data,
    }
  }
}

impl Response<serde_json::Value> {
  pub fn created(data: serde_json::Value) -> Self {
    Self {
      status: Status::Created,
      message: "Created successfully".into(),
      data,
    }
  }

  pub fn updated(data: serde_json::Value) -> Self {
    Self {
      status: Status::Updated,
      message: "Updated successfully".into(),
      data,
    }
  }

  pub fn deleted() -> Self {
    Self {
      status: Status::Deleted,
      message: "Deleted successfully".into(),
      data: serde_json::Value::Null,
    }
  }

  pub fn error(message: impl Into<String>) -> Self {
    Self {
      status: Status::Error,
      message: message.into(),
      data: serde_json::Value::Null,
    }
  }

  pub fn validation_error(message: impl Into<String>) -> Self {
    Self {
      status: Status::ValidationError,
      message: message.into(),
      data: serde_json::Value::Null,
    }
  }

  pub fn not_found(entity: &str) -> Self {
    Self {
      status: Status::NotFound,
      message: format!("{} not found", entity),
      data: serde_json::Value::Null,
    }
  }

  pub fn unauthorized() -> Self {
    Self {
      status: Status::Unauthorized,
      message: "Unauthorized".into(),
      data: serde_json::Value::Null,
    }
  }

  pub fn forbidden() -> Self {
    Self {
      status: Status::Forbidden,
      message: "Forbidden".into(),
      data: serde_json::Value::Null,
    }
  }

  pub fn empty() -> Self {
    Self {
      status: Status::Success,
      message: String::new(),
      data: serde_json::Value::Null,
    }
  }
}
