//! Shared parity-test harness: boots the process-wide JSON store in a
//! per-binary temp directory and serializes store-touching tests.

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};

static STORE_DIR: OnceLock<PathBuf> = OnceLock::new();
static STORE_LOCK: Mutex<()> = Mutex::new(());

/// Acquire exclusive access to the shared store and make sure it is
/// initialized inside a unique temp directory. Must be awaited from within a
/// tokio runtime (the tests are `#[tokio::test]`).
pub async fn setup_store() -> MutexGuard<'static, ()> {
    // Recover from poisoning: any panic must not cascade to other tests.
    let guard = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if STORE_DIR.get().is_none() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let db_dir = tmp.path().join("unichat_db");
        unichat_webapp::infrastructure::data_store::init_data_storage_in(&db_dir)
            .await
            .expect("init data storage");
        // Keep the directory alive for the process lifetime.
        let leaked = tmp.keep();
        STORE_DIR.set(leaked).ok();
    }
    guard
}

/// Store root directory (for restart/persistence assertions).
pub fn store_root() -> &'static PathBuf {
    STORE_DIR.get().expect("store initialized")
}
