use crate::{log_debug, log_error, log_info, log_warn};
use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::Duration as StdDuration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::runtime::Handle;
use tokio::task::JoinHandle;
pub struct OAuthLoopbackService {
  pending_callbacks: Mutex<HashMap<String, Receiver<String>>>,
  join_handles: Mutex<Vec<JoinHandle<()>>>,
}
impl Default for OAuthLoopbackService {
  fn default() -> Self {
    Self::new()
  }
}
impl OAuthLoopbackService {
  pub fn new() -> Self {
    Self {
      pending_callbacks: Mutex::new(HashMap::new()),
      join_handles: Mutex::new(Vec::new()),
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
    let handle = Handle::current().spawn(async move {
      log_debug!(
        "OAuth callback task started for platform {}",
        platform_key_owned
      );
      let listener = match TcpListener::bind(&address).await {
        Ok(l) => l,
        Err(e) => {
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
            if let Err(e) = tx.send(url) {
            }
          }
        }
        Err(e) => {
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
