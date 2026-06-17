/* sys lib */
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Serialize, Clone, PartialEq)]
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Response<T = serde_json::Value> {
  pub status: Status,
  pub message: String,
  pub data: T,
}

impl<T> Response<T> {
  pub fn new(status: Status, message: String, data: T) -> Self {
    Response {
      status,
      message,
      data,
    }
  }

  pub fn success(message: String, data: T) -> Self {
    Response::new(Status::Success, message, data)
  }

  pub fn success_data(data: T) -> Self {
    Response::new(Status::Success, String::new(), data)
  }

  pub fn success_with_data(message: impl Into<String>, data: T) -> Self {
    Response::new(Status::Success, message.into(), data)
  }

  pub fn info(message: String, data: T) -> Self {
    Response::new(Status::Info, message, data)
  }

  pub fn warning(message: String, data: T) -> Self {
    Response::new(Status::Warning, message, data)
  }

  pub fn error(message: impl Into<String>) -> Self
  where
    T: Default,
  {
    Response::new(Status::Error, message.into(), T::default())
  }

  pub fn created(data: T) -> Self {
    Response::new(Status::Created, "Created successfully".into(), data)
  }

  pub fn updated(data: T) -> Self {
    Response::new(Status::Updated, "Updated successfully".into(), data)
  }

  pub fn deleted(data: T) -> Self {
    Response::new(Status::Deleted, "Deleted successfully".into(), data)
  }

  pub fn validation_error(message: String) -> Self
  where
    T: Default,
  {
    Response::new(Status::ValidationError, message, T::default())
  }

  pub fn not_found(entity: &str) -> Self
  where
    T: Default,
  {
    Response::new(
      Status::NotFound,
      format!("{} not found", entity),
      T::default(),
    )
  }

  pub fn unauthorized() -> Self
  where
    T: Default,
  {
    Response::new(Status::Unauthorized, "Unauthorized".into(), T::default())
  }

  pub fn forbidden() -> Self
  where
    T: Default,
  {
    Response::new(Status::Forbidden, "Forbidden".into(), T::default())
  }
}

impl Response<Value> {
  pub fn success_with_id(message: &str, id: &str) -> Self {
    Response::success(message.to_string(), json!({ "id": id }))
  }
}
