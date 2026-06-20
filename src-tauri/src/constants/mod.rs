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
/// OAuth state expiration in seconds (10 minutes)
pub const OAUTH_STATE_EXPIRATION_SECS: i64 = 600;
/// Kick.com API User-Agent string
pub const KICK_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
/// Overlay server port
pub const OVERLAY_SERVER_PORT: u16 = 1450;
/// Maximum length for sanitized text (e.g., overlay messages)
pub const MAX_LEN: usize = 260;
/// Maximum live chat results per YouTube API request
pub const MAX_LIVE_CHAT_RESULTS: usize = 200;
/// Default message limit for overlay display
pub const DEFAULT_MESSAGE_LIMIT: usize = 50;
/// OAuth callback port for local server
pub const CALLBACK_PORT: u16 = 3456;
/// Polling interval in milliseconds for YouTube live chat
pub const POLLING_INTERVAL_MS: u64 = 2000;
/// Maximum number of widget/overlay IDs to track
pub const MAX_WIDGET_IDS: usize = 100;
/// Maximum messages per widget/overlay
pub const MESSAGE_MAX_PER_WIDGET: usize = 100;
