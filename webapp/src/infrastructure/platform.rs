//! Platform Integration Infrastructure
//!
//! Handles integration with external chat platforms (Twitch, Kick, YouTube).

use crate::domain::entities::*;
use crate::infrastructure::api::*;

/// Platform connection manager.
pub struct PlatformManager {
    twitch: TwitchIrcClient,
    kick: KickApiClient,
    #[allow(dead_code)]
    youtube: YouTubeApiClient,
}

#[allow(dead_code)]
impl PlatformManager {
    pub fn new() -> Self {
        Self {
            twitch: TwitchIrcClient::new(),
            kick: KickApiClient::new(),
            youtube: YouTubeApiClient::new(),
        }
    }

    /// Connect to a platform and join a channel.
    pub async fn connect(
        &self,
        platform: Platform,
        channel: ChatChannel,
        account: &ChatAccount,
    ) -> Result<(), String> {
        match platform {
            Platform::Twitch => {
                if let (Some(token), username) = (&account.access_token, &account.username) {
                    if !username.is_empty() {
                        self.twitch
                            .join_channel(&channel.channel_id, &channel.channel_name, username, token)
                            .await
                    } else {
                        Err("Twitch username not set".to_string())
                    }
                } else {
                    Err("Twitch account not authenticated".to_string())
                }
            }
            Platform::Kick => {
                if let Some(_token) = &account.access_token {
                    self.kick
                        .fetch_chatroom_id(&channel.channel_name)
                        .await?;
                    Ok(())
                } else {
                    Err("Kick account not authenticated".to_string())
                }
            }
            Platform::Youtube => {
                // YouTube uses different auth flow
                Ok(())
            }
        }
    }

    /// Disconnect from a platform channel.
    pub async fn disconnect(
        &self,
        platform: Platform,
        channel: &ChatChannel,
    ) -> Result<(), String> {
        match platform {
            Platform::Twitch => {
                self.twitch
                    .leave_channel(&channel.channel_id, &channel.channel_name)
                    .await
            }
            Platform::Kick | Platform::Youtube => Ok(()),
        }
    }

    /// Send a message to a platform.
    pub async fn send_message(
        &self,
        platform: Platform,
        channel: &ChatChannel,
        message: &str,
        account: &ChatAccount,
    ) -> Result<(), String> {
        match platform {
            Platform::Twitch => {
                if let Some(_token) = &account.access_token {
                    self.twitch
                        .send_message(&channel.channel_id, &channel.channel_name, message)
                        .await
                } else {
                    Err("Not authenticated".to_string())
                }
            }
            Platform::Kick => {
                if let Some(token) = &account.access_token {
                    let room_info = self.kick.fetch_chatroom_id(&channel.channel_name).await?;
                    self.kick
                        .send_message(&room_info.chatroom_id, message, token)
                        .await
                } else {
                    Err("Not authenticated".to_string())
                }
            }
            Platform::Youtube => Err("YouTube send not implemented".to_string()),
        }
    }
}

impl Default for PlatformManager {
    fn default() -> Self {
        Self::new()
    }
}
