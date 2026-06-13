use log;
use serde::Deserialize;
use serde::Serialize;

use crate::helpers::http_client::shared_client;
use crate::helpers::http_error_helper::build_fallback_urls;

#[derive(Debug, Deserialize)]
struct KickEmoteResponse {
  data: Option<Vec<KickEmoteData>>,
}

#[derive(Debug, Deserialize, Clone)]
struct KickEmoteData {
  id: Option<i64>,
  name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KickEmoteArrayResponse {
  id: Option<i64>,
  name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KickEmoteInfo {
  pub id: i64,
  pub name: String,
}

#[tauri::command]
pub async fn kickFetchChannelEmotes(channelSlug: String) -> Result<Vec<KickEmoteInfo>, String> {
  log::info!("Fetching channel emotes for: {}", channelSlug);
  let client = shared_client();

  let base = "https://kick.com";
  let paths = [
    &format!("/api/v2/channels/{}/emotes", channelSlug)[..],
    &format!("/api/v1/channels/{}/emotes", channelSlug)[..],
  ];
  let urls = build_fallback_urls(base, &paths);

  for url in urls {
    let response = client
      .get(&url)
      .header("Accept", "application/json")
      .header("User-Agent", "UniChat/1.0 (https://github.com/uni-chat)")
      .send()
      .await;

    if let Ok(response) = response {
      if response.status().is_success() {
        let text = response.text().await.unwrap_or_default();

        if let Ok(emotes_data) = serde_json::from_str::<Vec<KickEmoteArrayResponse>>(&text) {
          let emotes: Vec<KickEmoteInfo> = emotes_data
            .into_iter()
            .filter_map(|e| {
              e.id
                .and_then(|id| e.name.map(|name| KickEmoteInfo { id, name }))
            })
            .collect();

          if !emotes.is_empty() {
            log::debug!(
              "Fetched {} emotes for channel: {}",
              emotes.len(),
              channelSlug
            );
            return Ok(emotes);
          }
        }

        if let Ok(data_response) = serde_json::from_str::<KickEmoteResponse>(&text) {
          let emotes: Vec<KickEmoteInfo> = data_response
            .data
            .unwrap_or_default()
            .into_iter()
            .filter_map(|e| {
              e.id
                .and_then(|id| e.name.map(|name| KickEmoteInfo { id, name }))
            })
            .collect();

          if !emotes.is_empty() {
            log::debug!(
              "Fetched {} emotes for channel: {}",
              emotes.len(),
              channelSlug
            );
            return Ok(emotes);
          }
        }

        return Ok(vec![]);
      }
    }
  }

  log::debug!("No emotes found for channel: {}", channelSlug);
  Ok(vec![])
}
