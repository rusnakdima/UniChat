//! Overlay subscriber management module
//! Handles WebSocket subscriber lifecycle and message broadcasting

use axum::extract::ws::Message;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::mpsc;

use crate::models::overlay_message_model::{OverlayMessageModel, OverlayWidgetFilterModel};

/// Build a channel reference string for filtering
pub(crate) fn build_channel_ref(platform: &str, source_channel_id: &str) -> String {
  format!("{platform}:{source_channel_id}")
}

/// Represents a connected overlay subscriber (OBS browser source)
#[derive(Clone, Debug)]
pub struct OverlaySubscriber {
  pub id: u64,
  pub filter: Arc<tokio::sync::RwLock<OverlayWidgetFilterModel>>,
  pub channel_ids: Arc<tokio::sync::RwLock<Option<Vec<String>>>>,
  pub tx: mpsc::UnboundedSender<Message>,
}

/// Server state managing all overlay subscribers
#[derive(Clone, Debug, Default)]
pub struct OverlayServerState {
  subscribers: Arc<tokio::sync::Mutex<HashMap<String, Vec<OverlaySubscriber>>>>,
}

impl OverlayServerState {
  /// Create a new overlay server state
  pub fn new() -> Self {
    Self {
      subscribers: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
    }
  }

  /// Add a new overlay subscriber
  pub async fn add_subscriber(
    &self,
    widget_id: String,
    subscriber: OverlaySubscriber,
    channel_ids: Option<Vec<String>>,
  ) {
    let mut map = self.subscribers.lock().await;
    if let Some(ids) = channel_ids {
      *subscriber.channel_ids.write().await = Some(ids);
    }
    map
      .entry(widget_id)
      .or_insert_with(Vec::new)
      .push(subscriber);
  }

  /// Remove a subscriber by widget ID and subscriber ID
  pub async fn remove_subscriber(&self, widget_id: &str, subscriber_id: u64) {
    let mut map = self.subscribers.lock().await;
    if let Some(vec) = map.get_mut(widget_id) {
      vec.retain(|s| s.id != subscriber_id);
    }
  }

  /// Broadcast a message to all subscribers (filtered by widget config)
  pub async fn broadcast_message(&self, message: OverlayMessageModel) {
    let out_json = crate::models::overlay_message_model::OverlayWsOutgoingModel {
      kind: "overlayMessage".to_string(),
      message: Some(message.clone()),
    };
    let text = serde_json::to_string(&out_json)
      .unwrap_or_else(|_| "{\"type\":\"overlayMessage\"}".to_string());

    let snapshot: Vec<OverlaySubscriber> = {
      let map = self.subscribers.lock().await;
      map.values().flat_map(|vec| vec.clone()).collect()
    };

    let mut _sent_count = 0;
    let mut _filtered_supporter = 0;
    let mut _filtered_channel = 0;

    for sub in snapshot {
      // Apply supporter filter
      let filter: OverlayWidgetFilterModel = sub.filter.read().await.clone();
      let allowed = match filter {
        OverlayWidgetFilterModel::All => true,
        OverlayWidgetFilterModel::Supporters => message.is_supporter,
      };
      if !allowed {
        _filtered_supporter += 1;
        continue;
      }

      // Apply channel filter
      let channel_ids = sub.channel_ids.read().await;
      let _channel_allowed = match &*channel_ids {
        None => true,
        Some(ids) => {
          let is_allowed = ids.contains(&build_channel_ref(
            &message.platform,
            &message.source_channel_id,
          ));
          if !is_allowed {
            _filtered_channel += 1;
            continue;
          }
          true
        }
      };

      let _ = sub.tx.send(Message::Text(text.clone()));
      _sent_count += 1;
    }
  }
}

impl Default for OverlaySubscriber {
  fn default() -> Self {
    Self {
      id: 0,
      filter: Arc::new(tokio::sync::RwLock::new(OverlayWidgetFilterModel::All)),
      channel_ids: Arc::new(tokio::sync::RwLock::new(None)),
      tx: mpsc::unbounded_channel().0,
    }
  }
}
