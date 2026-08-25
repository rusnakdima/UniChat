//! Persistent application data store.
//!
//! Process-wide handle to the nosql_orm `JsonProvider` that backs every CRUD
//! handler. Mirrors master's `AppState.data.json_provider`: one provider over
//! a JSON document directory (master used `app_data_dir/unichat_db`).
//!
//! Initialize once at startup with [`init_data_storage`] /
//! [`init_data_storage_in`]; handlers resolve it through [`data_provider`].

use std::path::Path;
use std::sync::{Arc, OnceLock};

use dioxus_shared::storage::create_json_provider;
use nosql_orm::providers::json::JsonProvider;

/// Collection names, identical to the tables on `master`.
pub const CHAT_MESSAGES: &str = "chat_messages";
pub const CHAT_ACCOUNTS: &str = "chat_accounts";
pub const CHAT_CHANNELS: &str = "chat_channels";
pub const CUSTOM_EMOTES: &str = "custom_emotes";
pub const DASHBOARD_PREFERENCES: &str = "dashboard_preferences";

/// Fixed id for the singleton dashboard-preferences document.
///
/// Divergence note: `master`'s `get_or_create_dashboard_preferences` takes a
/// `user_id` argument and keys the singleton by it; the ported handler has no
/// parameter, so a single fixed key is used.
pub const DEFAULT_DASHBOARD_PREFERENCES_ID: &str = "default";

static PROVIDER: OnceLock<Arc<JsonProvider>> = OnceLock::new();

/// Install the process-wide data provider. First call wins; later calls are
/// no-ops (same semantics as PacMan3D's `init_*_storage`).
pub fn init_data_storage(provider: JsonProvider) {
    let _ = PROVIDER.set(Arc::new(provider));
}

/// Convenience initializer that opens a JSON store rooted at `data_dir`.
pub async fn init_data_storage_in(data_dir: impl AsRef<Path>) -> Result<(), String> {
    let provider = create_json_provider(data_dir)
        .await
        .map_err(|e| e.to_string())?;
    init_data_storage(provider);
    Ok(())
}

/// Idempotent variant used by startup and tests: initializes only when no
/// provider is installed yet.
pub async fn init_data_storage_in_once(data_dir: impl AsRef<Path>) -> Result<(), String> {
    if PROVIDER.get().is_some() {
        return Ok(());
    }
    init_data_storage_in(data_dir).await
}

/// Borrow the process-wide provider, or fail with an error message when
/// [`init_data_storage`] has not run yet.
pub fn data_provider() -> Result<Arc<JsonProvider>, String> {
    PROVIDER
        .get()
        .cloned()
        .ok_or_else(|| "Data storage not initialized".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn uninitialized_provider_reports_error() {
        // No init call in this binary; the getter must fail softly.
        if PROVIDER.get().is_none() {
            assert!(data_provider().is_err());
        }
    }
}
