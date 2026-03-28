//! Performance monitoring service
//! Tracks and reports application performance metrics

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

/// Performance metrics snapshot
#[derive(Clone, Debug, Default)]
pub struct PerformanceMetrics {
  /// Application cold start time in milliseconds
  pub cold_start_time_ms: u64,
  /// Memory usage when idle (in MB)
  pub memory_idle_mb: f64,
  /// Memory usage under load (in MB)
  pub memory_load_mb: f64,
  /// Average message processing latency (in ms)
  pub message_latency_ms: f64,
  /// CPU usage when idle (percentage)
  pub cpu_idle_percent: f64,
}

/// Performance targets for v0.2.0
pub struct PerformanceTargets {
  pub cold_start_time_ms: u64,      // Target: <1000ms
  pub memory_idle_mb: f64,          // Target: <100MB
  pub memory_load_mb: f64,          // Target: <250MB
  pub message_latency_ms: f64,      // Target: <20ms
  pub cpu_idle_percent: f64,        // Target: <1%
}

impl Default for PerformanceTargets {
  fn default() -> Self {
    Self {
      cold_start_time_ms: 1000,
      memory_idle_mb: 100.0,
      memory_load_mb: 250.0,
      message_latency_ms: 20.0,
      cpu_idle_percent: 1.0,
    }
  }
}

/// Performance monitoring service
pub struct PerformanceMonitor {
  metrics: Arc<RwLock<PerformanceMetrics>>,
  targets: PerformanceTargets,
  start_time: std::time::Instant,
}

impl PerformanceMonitor {
  /// Create a new performance monitor
  pub fn new() -> Self {
    Self {
      metrics: Arc::new(RwLock::new(PerformanceMetrics::default())),
      targets: PerformanceTargets::default(),
      start_time: std::time::Instant::now(),
    }
  }

  /// Record cold start completion
  pub fn record_cold_start(&self) {
    let elapsed = self.start_time.elapsed().as_millis() as u64;
    info!("⏱️  Cold start time: {}ms (target: <{}ms)", elapsed, self.targets.cold_start_time_ms);
    
    tokio::spawn(async move {
      // Update metrics asynchronously
    });
  }

  /// Record message processing latency
  pub async fn record_message_latency(&self, latency_ms: f64) {
    let mut metrics = self.metrics.write().await;
    // Use exponential moving average
    metrics.message_latency_ms = metrics.message_latency_ms * 0.9 + latency_ms * 0.1;
  }

  /// Get current metrics
  pub async fn get_metrics(&self) -> PerformanceMetrics {
    self.metrics.read().await.clone()
  }

  /// Check if performance targets are met
  pub async fn check_targets(&self) -> PerformanceReport {
    let metrics = self.metrics.read().await;
    PerformanceReport {
      cold_start_ok: metrics.cold_start_time_ms < self.targets.cold_start_time_ms,
      memory_idle_ok: metrics.memory_idle_mb < self.targets.memory_idle_mb,
      memory_load_ok: metrics.memory_load_mb < self.targets.memory_load_mb,
      latency_ok: metrics.message_latency_ms < self.targets.message_latency_ms,
      cpu_idle_ok: metrics.cpu_idle_percent < self.targets.cpu_idle_percent,
    }
  }
}

impl Default for PerformanceMonitor {
  fn default() -> Self {
    Self::new()
  }
}

/// Performance report showing which targets are met
#[derive(Debug)]
pub struct PerformanceReport {
  pub cold_start_ok: bool,
  pub memory_idle_ok: bool,
  pub memory_load_ok: bool,
  pub latency_ok: bool,
  pub cpu_idle_ok: bool,
}

impl PerformanceReport {
  /// Check if all targets are met
  pub fn all_ok(&self) -> bool {
    self.cold_start_ok
      && self.memory_idle_ok
      && self.memory_load_ok
      && self.latency_ok
      && self.cpu_idle_ok
  }

  /// Get summary of performance status
  pub fn summary(&self) -> String {
    let mut status = Vec::new();
    if self.cold_start_ok {
      status.push("✅ Cold start");
    } else {
      status.push("⚠️  Cold start");
    }
    if self.memory_idle_ok {
      status.push("✅ Memory idle");
    } else {
      status.push("⚠️  Memory idle");
    }
    if self.latency_ok {
      status.push("✅ Latency");
    } else {
      status.push("⚠️  Latency");
    }
    status.join(" | ")
  }
}
