//! OAuth Service
//! Handles the OAuth authentication flow (PKCE, state, loopback, callback)

use chrono::{Duration, Utc};
use log;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::Duration as StdDuration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::runtime::Runtime;
use tokio::task::JoinHandle;
use url::Url;

use crate::constants::OAUTH_CALLBACK_TIMEOUT_SECS;
use crate::helpers::config_helper::SharedConfig;
use crate::helpers::http_client::shared_client;
use crate::helpers::oauth_config_helper::get_oauth_provider_config;
use crate::models::auth_account_model::{AuthAccountModel, AuthStatusModel};
use crate::models::platform_type_model::{PlatformKey, PlatformTypeModel};
use crate::services::auth::oauth_internal::{exchange_code_for_token, fetch_identity};
use crate::services::auth::oauth_internal::{
  extract_callback_params, parse_loopback_redirect, pkce_challenge,
};
use crate::services::auth::oauth_state_service::OAuthStateService;

pub struct OAuthService {
  http: Client,
  oauth_state_service: OAuthStateService,
  oauth_loopback_service: OAuthLoopbackService,
}

impl Default for OAuthService {
  fn default() -> Self {
    Self::new()
  }
}

impl OAuthService {
  pub fn new() -> Self {
    Self {
      http: shared_client(),
      oauth_state_service: OAuthStateService::new(),
      oauth_loopback_service: OAuthLoopbackService::new(),
    }
  }

  pub fn start_auth(&self, platform: PlatformTypeModel) -> Result<String, String> {
    log_info!("Starting OAuth auth flow for platform: {:?}", platform);
    let config = get_oauth_provider_config(&platform, &SharedConfig::default())?;
    let (host, port, path) = parse_loopback_redirect(&config.redirect_uri)?;
    self
      .oauth_loopback_service
      .start_listener(platform.as_key(), &host, port, &path)?;
    let session = self.oauth_state_service.create_session(&platform)?;
    let code_challenge = pkce_challenge(&session.code_verifier);
    let scope = config.scopes.join(" ");

    let mut url =
      Url::parse(&config.authorize_url).map_err(|e| format!("invalid authorize url: {e}"))?;
    url
      .query_pairs_mut()
      .append_pair("client_id", &config.client_id)
      .append_pair("redirect_uri", &config.redirect_uri)
      .append_pair("response_type", "code")
      .append_pair("scope", &scope)
      .append_pair("state", &session.state)
      .append_pair("code_challenge", &code_challenge)
      .append_pair("code_challenge_method", "S256");

    log_debug!("Generated auth URL for {:?}", platform);
    Ok(url.to_string())
  }

  pub fn wait_for_callback(&self, platform: PlatformTypeModel) -> Result<String, String> {
    log_debug!("Waiting for OAuth callback for {:?}", platform);
    self
      .oauth_loopback_service
      .wait_for_callback(platform.as_key(), OAUTH_CALLBACK_TIMEOUT_SECS)
  }

  pub async fn complete_auth(
    &self,
    platform: PlatformTypeModel,
    callback_url: String,
    config: &SharedConfig,
  ) -> Result<AuthAccountModel, String> {
    log_debug!("Completing OAuth for {:?}", platform);
    let callback = Url::parse(&callback_url).map_err(|e| format!("invalid callback url: {e}"))?;
    let params = extract_callback_params(&callback);

    if let Some(error_code) = params.get("error") {
      let description = params
        .get("error_description")
        .cloned()
        .unwrap_or_else(|| "authorization failed at provider".to_string());
      log_warn!(
        "OAuth authorization denied for {:?}: {} - {}",
        platform,
        error_code,
        description
      );
      return Err(format!("{error_code}: {description}"));
    }

    let code = params
      .get("code")
      .ok_or_else(|| "missing code parameter in callback".to_string())?;
    let state_param = params
      .get("state")
      .ok_or_else(|| "missing state parameter in callback".to_string())?;
    let session = self.oauth_state_service.consume_session(state_param)?;
    let config = get_oauth_provider_config(&platform, config)?;

    log_debug!("Exchanging code for token for {:?}", platform);
    let token =
      exchange_code_for_token(&self.http, &platform, code, &session.code_verifier, &config).await?;

    log_debug!("Fetching identity for {:?}", platform);
    let (username, user_id, avatar_url) =
      fetch_identity(&self.http, &platform, &token, &config).await?;

    let expires_at = token
      .expires_in_seconds
      .map(|seconds| (Utc::now() + Duration::seconds(seconds)).to_rfc3339());
    let account = AuthAccountModel {
      id: format!("acc-{}-{}", platform.as_key(), user_id),
      platform: platform.clone(),
      username,
      user_id,
      avatar_url,
      access_token: Some(token.access_token.clone()),
      refresh_token: token.refresh_token.clone(),
      auth_status: AuthStatusModel::Authorized,
      token_expires_at: expires_at,
      authorized_at: Utc::now().to_rfc3339(),
    };

    log_info!(
      "OAuth completed successfully for {:?}, user: {}",
      platform,
      account.username
    );
    Ok(account)
  }
}

pub struct OAuthLoopbackService {
  pending_callbacks: Mutex<HashMap<String, Receiver<String>>>,
  join_handles: Mutex<Vec<JoinHandle<()>>>,
  runtime: Runtime,
}

impl Default for OAuthLoopbackService {
  fn default() -> Self {
    Self::new()
  }
}

impl OAuthLoopbackService {
  pub fn new() -> Self {
    let runtime = Runtime::new().expect("Failed to create tokio runtime for OAuth service");
    Self {
      pending_callbacks: Mutex::new(HashMap::new()),
      join_handles: Mutex::new(Vec::new()),
      runtime,
    }
  }

  pub fn start_listener(
    &self,
    platform_key: &str,
    host: &str,
    port: u16,
    callback_path: &str,
  ) -> Result<(), String> {
    let address = format!("{host}:{port}");
    log_info!(
      "Starting OAuth loopback listener for {} on {}:{}",
      platform_key,
      host,
      port
    );
    let (tx, rx) = mpsc::channel::<String>();

    {
      let mut guard = self
        .pending_callbacks
        .lock()
        .map_err(|_| "callback map lock poisoned".to_string())?;
      guard.insert(platform_key.to_string(), rx);
    }

    let expected_path = callback_path.to_string();
    let platform_key_owned = platform_key.to_string();
    let handle = self.runtime.spawn(async move {
      log_debug!(
        "OAuth callback task started for platform {}",
        platform_key_owned
      );

      let listener = match TcpListener::bind(&address).await {
        Ok(l) => l,
        Err(e) => {
          log_error!("Failed to bind loopback listener on {}: {}", address, e);
          return;
        }
      };

      match listener.accept().await {
        Ok((mut stream, _)) => {
          let mut buffer = [0_u8; 4096];
          let mut callback_url: Option<String> = None;

          match stream.read(&mut buffer).await {
            Ok(size) => {
              let request = String::from_utf8_lossy(&buffer[..size]).to_string();
              if let Some(first_line) = request.lines().next() {
                let parts: Vec<&str> = first_line.split_whitespace().collect();
                if parts.len() >= 2 {
                  let path_and_query = parts[1];
                  if path_and_query.starts_with(&expected_path) {
                    callback_url = Some(format!("http://{address}{path_and_query}"));
                  }
                }
              }
            }
            Err(e) => {
              log_warn!("Failed to read from stream: {}", e);
            }
          }

          let body = if callback_url.is_some() {
            "Authorization completed. You can close this tab."
          } else {
            "Authorization callback is invalid."
          };
          let status_line = if callback_url.is_some() {
            "HTTP/1.1 200 OK"
          } else {
            "HTTP/1.1 400 Bad Request"
          };
          let response = format!(
            "{status_line}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
          );

          let _ = stream.write_all(response.as_bytes()).await;
          if let Some(url) = callback_url {
            log_debug!(format!(
              "OAuth callback received for platform {}",
              platform_key_owned
            ));
            if let Err(e) = tx.send(url) {
              log_warn!("OAuth callback receiver already dropped: {}", e);
            }
          }
        }
        Err(e) => {
          log_warn!("Failed to accept connection: {}", e);
        }
      }

      log_debug!(
        "OAuth callback task stopped for platform {}",
        platform_key_owned
      );
    });

    {
      let mut guard = self
        .join_handles
        .lock()
        .map_err(|_| "join handles lock poisoned".to_string())?;
      guard.push(handle);
    }

    log_info!(
      "OAuth loopback listener started successfully for {}",
      platform_key
    );
    Ok(())
  }

  pub fn wait_for_callback(
    &self,
    platform_key: &str,
    timeout_seconds: u64,
  ) -> Result<String, String> {
    log_debug!(
      "Waiting for OAuth callback for platform {} (timeout: {}s)",
      platform_key,
      timeout_seconds
    );
    let receiver = {
      let mut guard = self
        .pending_callbacks
        .lock()
        .map_err(|_| "callback map lock poisoned".to_string())?;
      guard.remove(platform_key).ok_or_else(|| {
        log_error!(
          "Callback listener not started for platform {}",
          platform_key
        );
        "callback listener is not started".to_string()
      })?
    };

    let timeout = StdDuration::from_secs(timeout_seconds);
    receiver.recv_timeout(timeout).map_err(|_| {
      log_warn!(
        "OAuth callback timeout for platform {} after {}s",
        platform_key,
        timeout_seconds
      );
      "authorization callback timeout".to_string()
    })
  }
}

impl Drop for OAuthLoopbackService {
  fn drop(&mut self) {
    let handles: Vec<_> = self.join_handles.lock().unwrap().drain(..).collect();
    for handle in handles {
      handle.abort();
    }
  }
}
