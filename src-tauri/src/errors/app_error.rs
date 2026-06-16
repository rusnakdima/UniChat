use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum AppError {
  NotFound(String),
  ValidationError(String),
  Duplicate(String),
  Unauthorized,
  Forbidden,
  Internal(String),
  Database(String),
  Network(String),
  Io,
  PermissionDenied(String),
  InvalidPath(String),
}

impl fmt::Display for AppError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::NotFound(msg) => write!(f, "Not found: {}", msg),
      Self::ValidationError(msg) => write!(f, "Validation error: {}", msg),
      Self::Duplicate(msg) => write!(f, "Duplicate: {}", msg),
      Self::Unauthorized => write!(f, "Unauthorized"),
      Self::Forbidden => write!(f, "Forbidden"),
      Self::Internal(msg) => write!(f, "Internal error: {}", msg),
      Self::Database(msg) => write!(f, "Database error: {}", msg),
      Self::Network(msg) => write!(f, "Network error: {}", msg),
      Self::Io => write!(f, "IO error"),
      Self::PermissionDenied(msg) => write!(f, "Permission denied: {}", msg),
      Self::InvalidPath(msg) => write!(f, "Invalid path: {}", msg),
    }
  }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
  fn from(err: std::io::Error) -> Self {
    match err.kind() {
      std::io::ErrorKind::NotFound => Self::NotFound("Resource not found".into()),
      std::io::ErrorKind::PermissionDenied => Self::PermissionDenied(err.to_string()),
      _ => Self::Io,
    }
  }
}

impl From<serde_json::Error> for AppError {
  fn from(err: serde_json::Error) -> Self {
    Self::ValidationError(format!("JSON error: {}", err))
  }
}

impl From<nosql_orm::prelude::OrmError> for AppError {
  fn from(err: nosql_orm::prelude::OrmError) -> Self {
    use nosql_orm::prelude::OrmError;
    match err {
      OrmError::NotFound(_) => Self::NotFound("Entity not found".into()),
      OrmError::Duplicate(_) => Self::Duplicate("Entity already exists".into()),
      OrmError::Validation(_) => Self::ValidationError("Validation error".into()),
      OrmError::Query(_) => Self::Database(format!("Query error: {}", err)),
      OrmError::Io(_) => Self::Io,
      _ => Self::Database(format!("Database error: {}", err)),
    }
  }
}

impl AppError {
  pub fn into_response(self) -> crate::models::response::Response {
    use crate::models::response::Response;
    match self {
      Self::NotFound(msg) => Response::not_found(&msg),
      Self::ValidationError(msg) => Response::validation_error(msg),
      Self::Unauthorized => Response::unauthorized(),
      Self::Forbidden => Response::forbidden(),
      _ => Response::error(self.to_string()),
    }
  }
}
