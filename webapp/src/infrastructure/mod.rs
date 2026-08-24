//! Infrastructure Layer - UniChat
//!
//! This module contains implementations for external concerns like
//! platform APIs, persistence, and system integration.

pub mod api;
pub mod storage;
pub mod platform;

#[allow(unused_imports)]
pub use api::*;
#[allow(unused_imports)]
pub use storage::*;
#[allow(unused_imports)]
pub use platform::*;
