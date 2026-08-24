//! Storage Infrastructure
//!
//! Provides local storage and persistence capabilities.

use std::collections::HashMap;
use std::sync::RwLock;
use crate::domain::entities::*;

/// In-memory storage implementation for the application.
/// In a full desktop app, this would persist to disk.
pub struct LocalStorage {
    data: RwLock<HashMap<String, serde_json::Value>>,
}

#[allow(dead_code)]
impl LocalStorage {
    pub fn new() -> Self {
        Self {
            data: RwLock::new(HashMap::new()),
        }
    }

    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        self.data.read().ok()?.get(key).cloned()
    }

    pub fn set(&self, key: &str, value: serde_json::Value) -> Result<(), String> {
        self.data
            .write()
            .map_err(|e| e.to_string())?
            .insert(key.to_string(), value);
        Ok(())
    }

    pub fn remove(&self, key: &str) -> Result<(), String> {
        self.data
            .write()
            .map_err(|e| e.to_string())?
            .remove(key);
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        self.data.write().map_err(|e| e.to_string())?.clear();
        Ok(())
    }

    pub fn keys(&self) -> Vec<String> {
        self.data.read().map(|d| d.keys().cloned().collect()).unwrap_or_default()
    }

    pub fn contains(&self, key: &str) -> bool {
        self.data.read().map(|d| d.contains_key(key)).unwrap_or(false)
    }
}

impl Default for LocalStorage {
    fn default() -> Self {
        Self::new()
    }
}

/// Dashboard preferences storage.
pub struct PreferencesStorage {
    storage: LocalStorage,
}

#[allow(dead_code)]
impl PreferencesStorage {
    pub fn new() -> Self {
        Self {
            storage: LocalStorage::new(),
        }
    }

    pub fn get_preferences(&self) -> DashboardPreferences {
        self.storage
            .get("dashboard_preferences")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default()
    }

    pub fn save_preferences(&self, prefs: &DashboardPreferences) -> Result<(), String> {
        let value = serde_json::to_value(prefs).map_err(|e| e.to_string())?;
        self.storage.set("dashboard_preferences", value)
    }
}

impl Default for PreferencesStorage {
    fn default() -> Self {
        Self::new()
    }
}
