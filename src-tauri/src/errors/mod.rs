//! UniChat error handling module
//! Provides structured error types and utilities

mod error_constructors;
mod error_conversions;
mod error_types;

pub use error_types::{UniChatError, UniChatResult};
