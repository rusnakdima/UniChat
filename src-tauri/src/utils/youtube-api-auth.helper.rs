use serde::Deserialize;

pub enum AuthMethod {
  ApiKey(String),
}

impl AuthMethod {
  pub fn apply_to_request(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    request
  }

  pub fn key_param(&self) -> Option<String> {
    match self {
      AuthMethod::ApiKey(key) => Some(format!("key={}", key)),
    }
  }
}

pub fn get_auth_method(api_key: &str) -> AuthMethod {
  AuthMethod::ApiKey(api_key.to_string())
}

pub fn apply_auth(request: reqwest::RequestBuilder, auth: &AuthMethod) -> reqwest::RequestBuilder {
  auth.apply_to_request(request)
}

pub fn get_key_param(auth: &AuthMethod) -> Option<String> {
  auth.key_param()
}

pub fn api_error(context: &str, status: reqwest::StatusCode, error_text: &str) -> String {
  format!("YouTube {} API error ({}): {}", context, status, error_text)
}

#[derive(Debug, Deserialize)]
pub struct YouTubeSearchResponse {
  pub items: Option<Vec<YouTubeSearchItem>>,
  #[serde(rename = "nextPageToken")]
  pub next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct YouTubeSearchItem {
  pub id: YouTubeVideoId,
  #[serde(rename = "snippet")]
  pub snippet: Option<YouTubeSnippet>,
}

#[derive(Debug, Deserialize)]
pub struct YouTubeVideoId {
  #[serde(rename = "videoId")]
  pub video_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct YouTubeSnippet {
  #[serde(rename = "liveBroadcastContent")]
  pub live_broadcast_content: Option<String>,
}
