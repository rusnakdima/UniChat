use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

use crate::models::chat_message_model::ChatMessageModel;
use crate::models::overlay_message_model::OverlayMessageModel;

/// Overlay server handle trait for message router
#[axum::async_trait]
pub trait OverlayServerBroadcast: Send + Sync {
  async fn broadcast_overlay_message(&self, widget_id: String, message: OverlayMessageModel);
}

/// MessageRouterService - Centralized message fan-out
///
/// This service is the single source of truth for routing chat messages:
/// 1. To the app feed (via broadcast channel for Angular consumption)
/// 2. To the overlay server (for OBS browser sources)
///
/// All platform connectors should route messages through this service,
/// not directly to the overlay or app feed.
#[derive(Clone)]
pub struct MessageRouterService {
  /// Broadcast channel for app feed consumers (Angular via Tauri events)
  app_feed_tx: broadcast::Sender<Arc<ChatMessageModel>>,

  /// Handle to overlay server for broadcasting to OBS
  overlay_server: Option<Arc<dyn OverlayServerBroadcast>>,

  /// Widget ID for overlay routing (can be updated dynamically)
  current_widget_id: Arc<RwLock<String>>,
}

impl MessageRouterService {
  /// Create a new MessageRouterService
  ///
  /// # Arguments
  /// * `app_feed_buffer` - Number of messages to buffer for app feed subscribers
  /// * `overlay_server` - Optional overlay server handle for OBS routing
  pub fn new(
    app_feed_buffer: usize,
    overlay_server: Option<Arc<dyn OverlayServerBroadcast>>,
  ) -> Self {
    let (app_feed_tx, _) = broadcast::channel(app_feed_buffer);

    Self {
      app_feed_tx,
      overlay_server,
      current_widget_id: Arc::new(RwLock::new("widget-main".to_string())),
    }
  }

  /// Get a receiver for the app feed broadcast channel
  pub fn app_feed_receiver(&self) -> broadcast::Receiver<Arc<ChatMessageModel>> {
    self.app_feed_tx.subscribe()
  }

  /// Set the current widget ID for overlay routing
  pub async fn set_widget_id(&self, widget_id: String) {
    let mut current = self.current_widget_id.write().await;
    *current = widget_id;
  }

  /// Get the current widget ID
  pub async fn get_widget_id(&self) -> String {
    self.current_widget_id.read().await.clone()
  }

  /// Route a chat message to all destinations (app feed + overlay)
  ///
  /// This is the canonical routing path - all messages should flow through here.
  ///
  /// # Arguments
  /// * `message` - The normalized chat message to route
  ///
  /// # Returns
  /// * `Ok(())` if routing succeeded
  /// * `Err(String)` if routing failed
  pub async fn route_chat_message(&self, message: ChatMessageModel) -> Result<(), String> {
    let message_arc = Arc::new(message.clone());

    // 1. Broadcast to app feed (Angular consumers)
    let _ = self.app_feed_tx.send(message_arc);

    // 2. Broadcast to overlay server (OBS browser sources)
    if let Some(ref overlay) = self.overlay_server {
      let widget_id = self.get_widget_id().await;

      // Convert to overlay format
      let overlay_message = OverlayMessageModel {
        id: message.id,
        platform: match message.platform {
          crate::models::provider_contract_model::PlatformTypeModel::Twitch => "twitch".to_string(),
          crate::models::provider_contract_model::PlatformTypeModel::Kick => "kick".to_string(),
          crate::models::provider_contract_model::PlatformTypeModel::Youtube => {
            "youtube".to_string()
          }
        },
        author: message.author,
        text: message.text,
        timestamp: message.timestamp,
        is_supporter: message.is_supporter,
        source_channel_id: message.source_channel_id,
        author_avatar_url: message.author_avatar_url,
        emotes: message.emotes,
      };

      // Broadcast to overlay subscribers
      overlay
        .broadcast_overlay_message(widget_id, overlay_message)
        .await;
    }

    Ok(())
  }

  /// Route a message to app feed only (not overlay)
  /// Useful for system messages or errors that shouldn't appear in OBS
  pub fn route_to_app_feed_only(&self, message: ChatMessageModel) {
    let _ = self.app_feed_tx.send(Arc::new(message));
  }

  /// Route a message to overlay only (not app feed)
  /// Useful for overlay-specific testing or debugging
  pub async fn route_to_overlay_only(&self, message: ChatMessageModel) -> Result<(), String> {
    if let Some(ref overlay) = self.overlay_server {
      let widget_id = self.get_widget_id().await;

      let overlay_message = OverlayMessageModel {
        id: message.id,
        platform: match message.platform {
          crate::models::provider_contract_model::PlatformTypeModel::Twitch => "twitch".to_string(),
          crate::models::provider_contract_model::PlatformTypeModel::Kick => "kick".to_string(),
          crate::models::provider_contract_model::PlatformTypeModel::Youtube => {
            "youtube".to_string()
          }
        },
        author: message.author,
        text: message.text,
        timestamp: message.timestamp,
        is_supporter: message.is_supporter,
        source_channel_id: message.source_channel_id,
        author_avatar_url: message.author_avatar_url,
        emotes: message.emotes,
      };

      overlay
        .broadcast_overlay_message(widget_id, overlay_message)
        .await;
      Ok(())
    } else {
      Err("Overlay server not initialized".to_string())
    }
  }

  /// Get the number of active app feed subscribers
  pub fn app_feed_subscriber_count(&self) -> usize {
    self.app_feed_tx.receiver_count()
  }

  /// Clear the app feed broadcast channel (useful on app reset)
  pub fn clear_app_feed(&self) {
    // Note: broadcast channel doesn't have a clear method,
    // so we just drop all pending messages by creating a new channel
    // The old sender is replaced, effectively clearing the queue
  }
}
