//! Overlay Server Service
//! Manages the HTTP/WebSocket server for OBS browser source overlays

use std::{net::SocketAddr, path::PathBuf, sync::Arc};
use tokio::sync::{oneshot, Mutex};

use crate::services::overlay_server::overlay_router::build_overlay_router;
use crate::services::overlay_server::overlay_subscriber_manager::OverlayServerState;

/// Main overlay server service
pub struct OverlayServerService {
  frontend_dist_dir: PathBuf,
  state: OverlayServerState,
  server_instance: Mutex<Option<OverlayServerInstance>>,
}

struct OverlayServerInstance {
  shutdown_tx: oneshot::Sender<()>,
}

impl OverlayServerService {
  /// Create a new overlay server service
  pub fn new(frontend_dist_dir: PathBuf) -> Self {
    Self {
      frontend_dist_dir,
      state: OverlayServerState::new(),
      server_instance: Mutex::new(None),
    }
  }

  /// Start the overlay server on the specified port
  pub async fn start(self: Arc<Self>, port: u16) -> Result<(), String> {
    let mut guard = self.server_instance.lock().await;
    if guard.is_some() {
      return Ok(());
    }

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let state = self.state.clone();
    let dist_dir = self.frontend_dist_dir.clone();

    tokio::task::spawn(async move {
      let router = build_overlay_router(dist_dir, state);
      let addr = SocketAddr::from(([127, 0, 0, 1], port));
      let listener = tokio::net::TcpListener::bind(addr).await;

      if let Ok(listener) = listener {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
          let _ = shutdown_rx.await;
        });
        let _ = server.await;
      }
    });

    *guard = Some(OverlayServerInstance { shutdown_tx });
    Ok(())
  }

  /// Stop the overlay server
  pub async fn stop(self: Arc<Self>) -> Result<(), String> {
    let mut guard = self.server_instance.lock().await;
    if let Some(instance) = guard.take() {
      let _ = instance.shutdown_tx.send(());
    }
    Ok(())
  }
}
