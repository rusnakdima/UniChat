//! Shared HTTP client for outbound API calls (connection pooling, fewer TLS handshakes).

use crate::constants::KICK_USER_AGENT;
use once_cell::sync::Lazy;
use reqwest::Client;

static HTTP: Lazy<Client> = Lazy::new(|| {
  Client::builder()
    .user_agent(KICK_USER_AGENT)
    .pool_max_idle_per_host(8)
    .tcp_keepalive(std::time::Duration::from_secs(60))
    .build()
    .expect("reqwest Client build")
});

/// Returns a process-wide client reused across Tauri commands.
pub fn shared_client() -> &'static Client {
  &HTTP
}
