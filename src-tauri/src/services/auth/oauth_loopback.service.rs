use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::Duration;

pub struct OAuthLoopbackService {
  pendingCallbacks: Mutex<HashMap<String, Receiver<String>>>,
}

impl Default for OAuthLoopbackService {
  fn default() -> Self {
    Self::new()
  }
}

impl OAuthLoopbackService {
  pub fn new() -> Self {
    Self {
      pendingCallbacks: Mutex::new(HashMap::new()),
    }
  }

  pub fn start_listener(
    &self,
    platform_key: &str,
    host: &str,
    port: u16,
    callbackPath: &str,
  ) -> Result<(), String> {
    let address = format!("{host}:{port}");
    let listener = TcpListener::bind(&address).map_err(|e| format!("callback bind failed: {e}"))?;
    let (sender, receiver) = mpsc::channel::<String>();

    {
      let mut guard = self
        .pendingCallbacks
        .lock()
        .map_err(|_| "callback map lock poisoned".to_string())?;
      guard.insert(platform_key.to_string(), receiver);
    }

    let expectedPath = callbackPath.to_string();
    std::thread::spawn(move || {
      if let Ok((mut stream, _)) = listener.accept() {
        let mut buffer = [0_u8; 4096];
        let mut callbackUrl: Option<String> = None;
        if let Ok(size) = stream.read(&mut buffer) {
          let request = String::from_utf8_lossy(&buffer[..size]).to_string();
          if let Some(firstLine) = request.lines().next() {
            let parts: Vec<&str> = firstLine.split_whitespace().collect();
            if parts.len() >= 2 {
              let pathAndQuery = parts[1];
              if pathAndQuery.starts_with(&expectedPath) {
                callbackUrl = Some(format!("http://{address}{pathAndQuery}"));
              }
            }
          }
        }

        let body = if callbackUrl.is_some() {
          "Authorization completed. You can close this tab."
        } else {
          "Authorization callback is invalid."
        };
        let statusLine = if callbackUrl.is_some() {
          "HTTP/1.1 200 OK"
        } else {
          "HTTP/1.1 400 Bad Request"
        };
        let response = format!(
          "{statusLine}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
          body.len()
        );
        let _ = stream.write_all(response.as_bytes());
        if let Some(url) = callbackUrl {
          let _ = sender.send(url);
        }
      }
    });

    Ok(())
  }

  pub fn wait_for_callback(
    &self,
    platform_key: &str,
    timeout_seconds: u64,
  ) -> Result<String, String> {
    let receiver = {
      let mut guard = self
        .pendingCallbacks
        .lock()
        .map_err(|_| "callback map lock poisoned".to_string())?;
      guard
        .remove(platform_key)
        .ok_or_else(|| "callback listener is not started".to_string())?
    };

    receiver
      .recv_timeout(Duration::from_secs(timeout_seconds))
      .map_err(|_| "authorization callback timeout".to_string())
  }
}
