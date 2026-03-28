//! Memory optimization service
//! Provides memory management utilities for reducing memory footprint

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};

/// Memory optimization configuration
#[derive(Clone, Debug)]
pub struct MemoryOptimizationConfig {
  /// Enable aggressive memory pruning
  pub aggressive_pruning: bool,
  /// Maximum messages to keep in memory per channel
  pub max_messages_per_channel: usize,
  /// Enable message compression (for archived messages)
  pub enable_compression: bool,
  /// Prune interval in seconds
  pub prune_interval_secs: u64,
}

impl Default for MemoryOptimizationConfig {
  fn default() -> Self {
    Self {
      aggressive_pruning: false,
      max_messages_per_channel: 500,  // Reduced from 1000
      enable_compression: false,
      prune_interval_secs: 60,
    }
  }
}

/// Memory statistics
#[derive(Clone, Debug, Default)]
pub struct MemoryStats {
  /// Current memory usage in MB
  pub current_usage_mb: f64,
  /// Peak memory usage in MB
  pub peak_usage_mb: f64,
  /// Number of active channels
  pub active_channels: usize,
  /// Total messages in memory
  pub total_messages: usize,
  /// Messages pruned in last cycle
  pub messages_pruned: usize,
}

/// Memory optimization service
pub struct MemoryOptimizationService {
  config: MemoryOptimizationConfig,
  stats: Arc<RwLock<MemoryStats>>,
}

impl MemoryOptimizationService {
  /// Create a new memory optimization service
  pub fn new(config: MemoryOptimizationConfig) -> Self {
    Self {
      config,
      stats: Arc::new(RwLock::new(MemoryStats::default())),
    }
  }

  /// Get current memory stats
  pub async fn get_stats(&self) -> MemoryStats {
    self.stats.read().await.clone()
  }

  /// Update memory usage
  pub async fn update_usage(&self, usage_mb: f64, messages: usize, channels: usize) {
    let mut stats = self.stats.write().await;
    stats.current_usage_mb = usage_mb;
    stats.total_messages = messages;
    stats.active_channels = channels;

    // Track peak
    if usage_mb > stats.peak_usage_mb {
      stats.peak_usage_mb = usage_mb;
    }
  }

  /// Record messages pruned
  pub async fn record_prune(&self, count: usize) {
    let mut stats = self.stats.write().await;
    stats.messages_pruned = count;
    if count > 0 {
      debug!("🗑️  Pruned {} messages", count);
    }
  }

  /// Get optimization recommendations
  pub async fn get_recommendations(&self) -> Vec<String> {
    let stats = self.stats.read().await;
    let mut recommendations = Vec::new();

    if stats.current_usage_mb > 250.0 {
      recommendations.push(
        "⚠️  High memory usage detected. Consider reducing max_messages_per_channel.".to_string()
      );
    }

    if stats.active_channels > 10 {
      recommendations.push(
        "💡 Many active channels. Consider using split view to reduce memory.".to_string()
      );
    }

    if stats.total_messages > 5000 {
      recommendations.push(
        "📊 Large message cache. Enable aggressive pruning for better performance.".to_string()
      );
    }

    recommendations
  }

  /// Check if memory usage is within targets
  pub async fn check_targets(&self, target_mb: f64) -> bool {
    let stats = self.stats.read().await;
    stats.current_usage_mb < target_mb
  }

  /// Get configuration
  pub fn get_config(&self) -> &MemoryOptimizationConfig {
    &self.config
  }

  /// Enable aggressive pruning mode
  pub fn enable_aggressive_pruning(&mut self) {
    self.config.aggressive_pruning = true;
    self.config.max_messages_per_channel = 250;  // More aggressive
    self.config.prune_interval_secs = 30;         // More frequent
    info!("🔧 Enabled aggressive memory pruning mode");
  }

  /// Disable aggressive pruning mode
  pub fn disable_aggressive_pruning(&mut self) {
    self.config.aggressive_pruning = false;
    self.config.max_messages_per_channel = 500;
    self.config.prune_interval_secs = 60;
    info!("🔧 Disabled aggressive memory pruning mode");
  }
}

impl Default for MemoryOptimizationService {
  fn default() -> Self {
    Self::new(MemoryOptimizationConfig::default())
  }
}

/// Memory-efficient data structures for chat messages
pub mod efficient_structs {
  use std::sync::Arc;

  /// Compact message representation for archival
  #[derive(Clone, Debug)]
  pub struct CompactMessage {
    pub id: Arc<str>,
    pub author: Arc<str>,
    pub text: Arc<str>,
    pub timestamp: u64,  // Unix timestamp (more compact than String)
    pub platform: u8,    // 0=twitch, 1=kick, 2=youtube
  }

  impl CompactMessage {
    pub fn platform_name(&self) -> &'static str {
      match self.platform {
        0 => "twitch",
        1 => "kick",
        2 => "youtube",
        _ => "unknown",
      }
    }
  }

  /// Ring buffer for efficient message storage
  pub struct MessageRingBuffer<T> {
    buffer: Vec<Option<T>>,
    head: usize,
    size: usize,
    capacity: usize,
  }

  impl<T> MessageRingBuffer<T> {
    pub fn new(capacity: usize) -> Self {
      let mut buffer = Vec::with_capacity(capacity);
      buffer.resize_with(capacity, || None);
      Self {
        buffer,
        head: 0,
        size: 0,
        capacity,
      }
    }

    pub fn push(&mut self, item: T) -> Option<T> {
      let evicted = self.buffer[self.head].take();
      self.buffer[self.head] = Some(item);
      self.head = (self.head + 1) % self.capacity;
      if self.size < self.capacity {
        self.size += 1;
      }
      evicted
    }

    pub fn iter(&self) -> impl Iterator<Item = &T> {
      self.buffer.iter().filter_map(|x| x.as_ref())
    }

    pub fn len(&self) -> usize {
      self.size
    }

    pub fn is_empty(&self) -> bool {
      self.size == 0
    }
  }
}
