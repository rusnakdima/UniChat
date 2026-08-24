//! Application State - UniChat

#[allow(unused_imports)]
use dioxus::prelude::*;

/// Root application state container
#[derive(Default, Clone)]
#[allow(dead_code)]
pub struct AppState;

#[allow(dead_code)]
pub fn use_app_state() -> AppState {
    AppState
}
