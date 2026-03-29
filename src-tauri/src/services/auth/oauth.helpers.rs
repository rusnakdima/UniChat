//! OAuth helper functions
//! Provides utility functions for OAuth flow (PKCE, callback parsing, redirect parsing)

use base64::Engine;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use url::Url;

/// Extract callback parameters from OAuth callback URL
/// Handles both query params and fragment params (implicit flow)
pub(crate) fn extract_callback_params(callback: &Url) -> HashMap<String, String> {
  let mut params: HashMap<String, String> = callback.query_pairs().into_owned().collect();

  if params.is_empty() {
    if let Some(fragment) = callback.fragment() {
      for (key, value) in url::form_urlencoded::parse(fragment.as_bytes()) {
        params.insert(key.into_owned(), value.into_owned());
      }
    }
  }

  params
}

/// Generate PKCE code challenge from code verifier
/// Uses SHA256 and base64url encoding (no padding)
pub(crate) fn pkce_challenge(code_verifier: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(code_verifier.as_bytes());
  let hashed = hasher.finalize();
  base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hashed)
}

/// Parse loopback redirect URI into host, port, and path components
pub(crate) fn parse_loopback_redirect(redirect_uri: &str) -> Result<(String, u16, String), String> {
  let parsed = Url::parse(redirect_uri).map_err(|e| format!("invalid redirect uri: {e}"))?;
  if parsed.scheme() != "http" && parsed.scheme() != "https" {
    return Err("redirect uri must use http/https for loopback flow".to_string());
  }

  let host = parsed
    .host_str()
    .ok_or_else(|| "redirect uri host is missing".to_string())?
    .to_string();
  let port = parsed
    .port_or_known_default()
    .ok_or_else(|| "redirect uri port is missing".to_string())?;
  let path = if parsed.path().is_empty() {
    "/".to_string()
  } else {
    parsed.path().to_string()
  };
  Ok((host, port, path))
}
