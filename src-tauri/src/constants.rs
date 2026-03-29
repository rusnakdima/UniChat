//! Application-wide constants
//! Centralized configuration for magic numbers and fixed values

/// OAuth state string length (for PKCE flow)
pub const OAUTH_STATE_LENGTH: usize = 32;

/// OAuth code verifier length (for PKCE flow)
pub const OAUTH_CODE_VERIFIER_LENGTH: usize = 64;

/// WebSocket receive timeout in seconds (for dead connection detection)
pub const WS_RECEIVE_TIMEOUT_SECS: u64 = 30;

/// OAuth callback timeout in seconds
pub const OAUTH_CALLBACK_TIMEOUT_SECS: u64 = 240;

/// Kick.com API User-Agent string
pub const KICK_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
