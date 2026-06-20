use crate::models::overlay_message_model::OverlayMessageModel;
use crate::{log_debug, log_error, log_info, log_warn};
use futures_util::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

static PRIVMSG_REGEX: Lazy<Regex> =
  Lazy::new(|| Regex::new(r":(.+)!.+@.+\.tmi\.twitch\.tv PRIVMSG #(.+) :(.+)").unwrap());

static TAGS_REGEX: Lazy<Regex> =
  Lazy::new(|| Regex::new(r"@(.+) :.+.tmi\.twitch\.tv PRIVMSG #.+ :.+").unwrap());

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchChatMessage {
  pub id: String,
  pub platform: String,
  pub channel_id: String,
  pub channel_name: String,
  pub author: String,
  pub author_id: String,
  pub text: String,
  pub timestamp: i64,
  pub badges: Vec<TwitchBadge>,
  pub color: String,
  pub emotes: Vec<TwitchEmote>,
  pub is_mod: bool,
  pub is_subscriber: bool,
  pub is_highlighted: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchBadge {
  pub set_id: String,
  pub id: String,
  pub version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchEmote {
  pub id: String,
  pub code: String,
  pub urls: Vec<String>,
}

struct TwitchChannelConnection {
  channel_id: String,
  channel_name: String,
  sender: mpsc::Sender<String>,
}

pub struct TwitchIrcService {
  connections: Arc<RwLock<HashMap<String, TwitchChannelConnection>>>,
  app_handle: Arc<AppHandle>,
}

impl TwitchIrcService {
  pub fn new(app_handle: AppHandle) -> Self {
    Self {
      connections: Arc::new(RwLock::new(HashMap::new())),
      app_handle: Arc::new(app_handle),
    }
  }

  pub async fn join_channel(
    &self,
    channel_id: String,
    channel_name: String,
    username: String,
    oauth_token: String,
  ) -> Result<(), String> {
    let connection_key = format!("{}:{}", channel_id, channel_name);

    if self.connections.read().await.contains_key(&connection_key) {
      log_info!("Already connected to channel {}", channel_name);
      return Ok(());
    }

    log_info!("Connecting to Twitch IRC for channel {}", channel_name);

    let connections = self.connections.clone();
    let app_handle = self.app_handle.clone();
    let channel_id_clone = channel_id.clone();
    let channel_name_clone = channel_name.clone();

    let (tx, mut rx) = mpsc::channel::<String>(100);

    {
      let mut connections_write = connections.write().await;
      connections_write.insert(
        connection_key.clone(),
        TwitchChannelConnection {
          channel_id: channel_id.clone(),
          channel_name: channel_name.clone(),
          sender: tx,
        },
      );
    }

    tokio::spawn(async move {
      let cleanup_key = format!("{}:{}", channel_id_clone, channel_name_clone);

      let (ws_stream, _) = match connect_async("wss://irc-ws.chat.twitch.tv:443").await {
        Ok(s) => s,
        Err(e) => {
          log_error!("WebSocket connection failed: {}", e);
          connections.write().await.remove(&cleanup_key);
          return;
        }
      };

      let (mut write, mut read) = ws_stream.split();

      let cap_req = "CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership\r\n";
      if let Err(e) = write.send(Message::Text(cap_req.to_string())).await {
        log_error!("Failed to send CAP request: {}", e);
        connections.write().await.remove(&cleanup_key);
        return;
      }

      let pass_req = format!("PASS oauth:{}\r\n", oauth_token);
      if let Err(e) = write.send(Message::Text(pass_req)).await {
        log_error!("Failed to send PASS: {}", e);
        connections.write().await.remove(&cleanup_key);
        return;
      }

      let nick_req = format!("NICK {}\r\n", username.to_lowercase());
      if let Err(e) = write.send(Message::Text(nick_req)).await {
        log_error!("Failed to send NICK: {}", e);
        connections.write().await.remove(&cleanup_key);
        return;
      }

      let join_req = format!("JOIN #{}\r\n", channel_name.to_lowercase());
      if let Err(e) = write.send(Message::Text(join_req)).await {
        log_error!("Failed to send JOIN: {}", e);
        connections.write().await.remove(&cleanup_key);
        return;
      }

      log_info!("Joined Twitch channel {}", channel_name_clone);

      loop {
        tokio::select! {
          msg = read.next() => {
            match msg {
              Some(Ok(Message::Text(text))) => {
                let text_str = text.to_string();
                if text_str.contains("PING") {
                  let pong = text_str.replace("PING", "PONG");
                  if write.send(Message::Text(pong)).await.is_err() {
                    break;
                  }
                  continue;
                }

                if let Some(parsed) =
                  parse_twitch_message(&text_str, &channel_id_clone, &channel_name_clone)
                {
                  if let Err(e) = app_handle.emit("twitch-message", &parsed) {
                    log_error!("Failed to emit twitch message: {}", e);
                  }
                }
              }
              Some(Ok(Message::Close(_))) => {
                log_warn!("WebSocket closed for channel {}", channel_name_clone);
                break;
              }
              Some(Err(e)) => {
                log_error!("WebSocket error: {}", e);
                break;
              }
              None => {
                log_warn!("WebSocket stream ended for channel {}", channel_name_clone);
                break;
              }
              _ => {}
            }
          }
          outgoing = rx.recv() => {
            match outgoing {
              Some(text) => {
                if write.send(Message::Text(text)).await.is_err() {
                  log_error!("Failed to send outgoing message for channel {}", channel_name_clone);
                  break;
                }
              }
              None => {
                log_warn!("Outgoing channel closed for {}", channel_name_clone);
                break;
              }
            }
          }
        }
      }

      connections
        .write()
        .await
        .remove(&format!("{}:{}", channel_id_clone, channel_name_clone));
      log_info!("Disconnected from Twitch channel {}", channel_name_clone);
    });

    Ok(())
  }

  pub async fn leave_channel(&self, channel_id: String, channel_name: String) {
    let connection_key = format!("{}:{}", channel_id, channel_name);
    let connections = self.connections.clone();

    let conn = connections.write().await.remove(&connection_key);
    if let Some(conn) = conn {
      let _ = conn.sender.send("QUIT\r\n".to_string()).await;
      log_info!("Left Twitch channel {}", channel_name);
    }
  }

  pub async fn send_message(
    &self,
    channel_id: String,
    channel_name: String,
    message: String,
  ) -> Result<(), String> {
    let connection_key = format!("{}:{}", channel_id, channel_name);
    let connections = self.connections.read().await;

    if let Some(conn) = connections.get(&connection_key) {
      let privmsg = format!("PRIVMSG #{} :{}\r\n", channel_name.to_lowercase(), message);
      conn.sender.send(privmsg).await.map_err(|e| e.to_string())?;
      Ok(())
    } else {
      Err("Not connected to channel".to_string())
    }
  }

  pub async fn is_connected(&self, channel_id: &str, channel_name: &str) -> bool {
    let connection_key = format!("{}:{}", channel_id, channel_name);
    self.connections.read().await.contains_key(&connection_key)
  }
}

fn parse_twitch_message(
  raw: &str,
  channel_id: &str,
  channel_name: &str,
) -> Option<TwitchChatMessage> {
  let tags_str = if let Some(at_pos) = raw.find('@') {
    if let Some(space_pos) = raw[at_pos..].find(' ') {
      Some(&raw[at_pos..at_pos + space_pos])
    } else {
      None
    }
  } else {
    None
  };

  if let Some(caps) = PRIVMSG_REGEX.captures(raw) {
    let author = caps.get(1)?.as_str().to_string();
    let _chan = caps.get(2)?.as_str();
    let text = caps.get(3)?.as_str().to_string();

    let mut badges = Vec::new();
    let mut color = "#FFFFFF".to_string();
    let mut user_id = String::new();
    let mut emotes: Vec<TwitchEmote> = Vec::new();
    let mut is_mod = false;
    let mut is_subscriber = false;

    if let Some(tags) = tags_str {
      for tag in tags.split(';') {
        let parts: Vec<&str> = tag.splitn(2, '=').collect();
        if parts.len() != 2 {
          continue;
        }
        match parts[0] {
          "badges" => {
            for badge in parts[1].split(',') {
              let badge_parts: Vec<&str> = badge.splitn(2, '/').collect();
              if badge_parts.len() == 2 {
                let ver_parts: Vec<&str> = badge_parts[1].splitn(2, '/').collect();
                badges.push(TwitchBadge {
                  set_id: badge_parts[0].to_string(),
                  id: ver_parts[0].to_string(),
                  version: ver_parts.get(1).unwrap_or(&"").to_string(),
                });
              }
            }
          }
          "color" => {
            if !parts[1].is_empty() {
              color = parts[1].to_string();
            }
          }
          "user-id" => {
            user_id = parts[1].to_string();
          }
          "emotes" => {
            for emote in parts[1].split('/') {
              let emote_parts: Vec<&str> = emote.splitn(2, ':').collect();
              if emote_parts.len() == 2 {
                emotes.push(TwitchEmote {
                  id: emote_parts[0].to_string(),
                  code: emote_parts[1].to_string(),
                  urls: vec![format!(
                    "https://static-cdn.jtvnw.net/emoticons/v2/{}/default/light/1.0",
                    emote_parts[0]
                  )],
                });
              }
            }
          }
          "mod" => {
            is_mod = parts[1] == "1";
          }
          "subscriber" => {
            is_subscriber = parts[1] == "1";
          }
          _ => {}
        }
      }
    }

    let timestamp = chrono::Utc::now().timestamp_millis();
    let id = format!("twitch-{}-{}-{}", channel_id, user_id, timestamp);

    Some(TwitchChatMessage {
      id,
      platform: "twitch".to_string(),
      channel_id: channel_id.to_string(),
      channel_name: channel_name.to_string(),
      author,
      author_id: user_id,
      text,
      timestamp,
      badges,
      color,
      emotes,
      is_mod,
      is_subscriber,
      is_highlighted: false,
    })
  } else {
    None
  }
}
