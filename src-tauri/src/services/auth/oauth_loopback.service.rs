use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc::{self, Receiver};
use std::sync::Mutex;
use std::time::Duration;

pub struct OAuthLoopbackService {
  pending_callbacks: Mutex<HashMap<String, Receiver<String>>>,
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
    let listener = TcpListener::bind(&address).map_err(|e| format!("callback bind failed: {e}"))?;
    let (sender, receiver) = mpsc::channel::<String>();

    {
      let mut guard = self
        .pending_callbacks
        .lock()
        .map_err(|_| "callback map lock poisoned".to_string())?;
      guard.insert(platform_key.to_string(), receiver);
    }

    let expected_path = callback_path.to_string();
    std::thread::spawn(move || {
      if let Ok((mut stream, _)) = listener.accept() {
        let mut buffer = [0_u8; 4096];
        let mut callback_url: Option<String> = None;
        if let Ok(size) = stream.read(&mut buffer) {
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
        let _ = stream.write_all(response.as_bytes());
        if let Some(url) = callback_url {
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
        .pending_callbacks
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
