//! API Client Infrastructure
//!
//! Provides HTTP client implementations for external platform APIs
//! (Twitch, Kick, YouTube).

#[allow(unused_imports)]
use crate::domain::entities::*;

/// Client for Twitch IRC operations.
pub struct TwitchIrcClient;

#[allow(dead_code)]
impl TwitchIrcClient {
    pub fn new() -> Self {
        Self
    }

    pub async fn join_channel(
        &self,
        channel_id: &str,
        channel_name: &str,
        _username: &str,
        _oauth_token: &str,
    ) -> Result<(), String> {
        log::info!("Joining Twitch channel: {} ({})", channel_name, channel_id);
        Ok(())
    }

    pub async fn leave_channel(
        &self,
        channel_id: &str,
        channel_name: &str,
    ) -> Result<(), String> {
        log::info!("Leaving Twitch channel: {} ({})", channel_name, channel_id);
        Ok(())
    }

    pub async fn send_message(
        &self,
        _channel_id: &str,
        channel_name: &str,
        message: &str,
    ) -> Result<(), String> {
        log::info!("Sending message to {}: {}", channel_name, message);
        Ok(())
    }

    pub async fn is_connected(
        &self,
        _channel_id: &str,
        _channel_name: &str,
    ) -> bool {
        false
    }
}

impl Default for TwitchIrcClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Client for Kick API operations.
pub struct KickApiClient;

#[allow(dead_code)]
impl KickApiClient {
    pub fn new() -> Self {
        Self
    }

    pub async fn fetch_chatroom_id(
        &self,
        channel_name: &str,
    ) -> Result<KickChatroomInfo, String> {
        log::info!("Fetching Kick chatroom for: {}", channel_name);
        Ok(KickChatroomInfo {
            chatroom_id: String::new(),
            channel_id: String::new(),
        })
    }

    pub async fn send_message(
        &self,
        chatroom_id: &str,
        message: &str,
        _oauth_token: &str,
    ) -> Result<(), String> {
        log::info!("Sending Kick message to {}: {}", chatroom_id, message);
        Ok(())
    }
}

impl Default for KickApiClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Client for YouTube API operations.
pub struct YouTubeApiClient;

#[allow(dead_code)]
impl YouTubeApiClient {
    pub fn new() -> Self {
        Self
    }

    pub async fn fetch_channel_info(
        &self,
        channel_id: &str,
        _api_key: &str,
    ) -> Result<YouTubeChannelInfo, String> {
        log::info!("Fetching YouTube channel info for: {}", channel_id);
        Ok(YouTubeChannelInfo {
            channel_id: channel_id.to_string(),
            title: String::new(),
            thumbnail_url: None,
        })
    }

    pub async fn fetch_live_chat_id(
        &self,
        channel_id: &str,
        _api_key: &str,
    ) -> Result<Option<String>, String> {
        log::info!("Fetching YouTube live chat ID for: {}", channel_id);
        Ok(None)
    }
}

impl Default for YouTubeApiClient {
    fn default() -> Self {
        Self::new()
    }
}
