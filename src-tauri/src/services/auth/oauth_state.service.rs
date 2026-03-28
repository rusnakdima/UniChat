use std::collections::HashMap;
use std::sync::Mutex;

use chrono::Utc;
use rand::{distributions::Alphanumeric, Rng};

use crate::models::auth_oauth_model::OAuthPendingSessionModel;
use crate::models::provider_contract_model::{PlatformKey, PlatformTypeModel};

pub struct OAuthStateService {
  sessions: Mutex<HashMap<String, OAuthPendingSessionModel>>,
}

impl Default for OAuthStateService {
  fn default() -> Self {
    Self::new()
  }
}

impl OAuthStateService {
  pub fn new() -> Self {
    Self {
      sessions: Mutex::new(HashMap::new()),
    }
  }

  pub fn create_session(
    &self,
    platform: &PlatformTypeModel,
  ) -> Result<OAuthPendingSessionModel, String> {
    let state = format!("{}-{}", platform.asKey(), randomString(32));
    let session = OAuthPendingSessionModel {
      state: state.clone(),
      code_verifier: randomString(64),
      created_at: Utc::now().timestamp(),
    };

    let mut guard = self
      .sessions
      .lock()
      .map_err(|_| "oauth session lock poisoned".to_string())?;
    guard.insert(state, session.clone());
    Ok(session)
  }

  pub fn consume_session(&self, state: &str) -> Result<OAuthPendingSessionModel, String> {
    let mut guard = self
      .sessions
      .lock()
      .map_err(|_| "oauth session lock poisoned".to_string())?;
    guard
      .remove(state)
      .ok_or_else(|| "oauth state is missing or expired".to_string())
  }
}

fn randomString(len: usize) -> String {
  rand::thread_rng()
    .sample_iter(&Alphanumeric)
    .take(len)
    .map(char::from)
    .collect()
}
