//! Message batching service for high-throughput scenarios
//! Batches multiple messages together to reduce processing overhead

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::interval;
use tracing::debug;

use crate::models::chat_message_model::ChatMessageModel;

/// Message batch for efficient processing
#[derive(Clone, Debug)]
pub struct MessageBatch {
  pub messages: Vec<ChatMessageModel>,
  pub created_at: std::time::Instant,
}

impl MessageBatch {
  pub fn new(messages: Vec<ChatMessageModel>) -> Self {
    Self {
      messages,
      created_at: std::time::Instant::now(),
    }
  }

  pub fn size(&self) -> usize {
    self.messages.len()
  }
}

/// Configuration for message batching
#[derive(Clone, Debug)]
pub struct BatchingConfig {
  /// Maximum number of messages per batch
  pub max_batch_size: usize,
  /// Maximum time to wait before flushing a partial batch
  pub flush_interval_ms: u64,
  /// Enable batching (can be disabled for low-traffic scenarios)
  pub enabled: bool,
}

impl Default for BatchingConfig {
  fn default() -> Self {
    Self {
      max_batch_size: 50,        // Batch up to 50 messages
      flush_interval_ms: 100,    // Flush every 100ms
      enabled: true,
    }
  }
}

/// Message batching service
pub struct MessageBatchingService {
  config: BatchingConfig,
  sender: mpsc::Sender<ChatMessageModel>,
  receiver: Arc<tokio::sync::Mutex<mpsc::Receiver<ChatMessageModel>>>,
}

impl MessageBatchingService {
  /// Create a new message batching service
  pub fn new(config: BatchingConfig) -> Self {
    let (sender, receiver) = mpsc::channel::<ChatMessageModel>(1000);
    Self {
      config,
      sender,
      receiver: Arc::new(tokio::sync::Mutex::new(receiver)),
    }
  }

  /// Queue a message for batching
  pub async fn queue_message(&self, message: ChatMessageModel) -> Result<(), String> {
    if !self.config.enabled {
      // Batching disabled, process immediately
      return Ok(());
    }

    self
      .sender
      .send(message)
      .await
      .map_err(|e| format!("Failed to queue message: {e}"))
  }

  /// Process message batches
  /// Call this in a loop to continuously process batches
  pub async fn process_batches<F, Fut>(
    &self,
    mut handler: F,
  ) -> Result<(), String>
  where
    F: FnMut(MessageBatch) -> Fut,
    Fut: std::future::Future<Output = Result<(), String>>,
  {
    if !self.config.enabled {
      return Err("Batching is disabled".to_string());
    }

    let mut batch = Vec::with_capacity(self.config.max_batch_size);
    let mut flush_interval = interval(Duration::from_millis(self.config.flush_interval_ms));
    let receiver = self.receiver.clone();

    loop {
      tokio::select! {
        // Receive messages
        result = async {
          let mut rx = receiver.lock().await;
          rx.recv().await
        } => {
          if let Some(message) = result {
            batch.push(message);

            // Flush if batch is full
            if batch.len() >= self.config.max_batch_size {
              let message_batch = MessageBatch::new(batch.clone());
              debug!("📦 Flushing batch of {} messages", batch.len());
              handler(message_batch).await?;
              batch.clear();
            }
          }
        }

        // Time-based flush
        _ = flush_interval.tick() => {
          if !batch.is_empty() {
            let message_batch = MessageBatch::new(batch.clone());
            debug!("⏰ Time-based flush of {} messages", batch.len());
            handler(message_batch).await?;
            batch.clear();
          }
        }
      }
    }
  }

  /// Get receiver for direct message consumption (when batching is disabled)
  pub fn get_receiver(&self) -> Arc<tokio::sync::Mutex<mpsc::Receiver<ChatMessageModel>>> {
    self.receiver.clone()
  }

  /// Check if batching is enabled
  pub fn is_enabled(&self) -> bool {
    self.config.enabled
  }

  /// Enable or disable batching
  pub fn set_enabled(&mut self, enabled: bool) {
    self.config.enabled = enabled;
  }
}

/// Optimizations for high-throughput scenarios (1000+ msg/min)
pub mod optimizations {
  use super::*;

  /// Create a batching config optimized for high-traffic
  pub fn high_traffic_config() -> BatchingConfig {
    BatchingConfig {
      max_batch_size: 100,       // Larger batches for high traffic
      flush_interval_ms: 50,     // Faster flushes
      enabled: true,
    }
  }

  /// Create a batching config optimized for low-traffic
  pub fn low_traffic_config() -> BatchingConfig {
    BatchingConfig {
      max_batch_size: 20,        // Smaller batches
      flush_interval_ms: 200,    // Slower flushes
      enabled: false,            // Disable for very low traffic
    }
  }
}
