use crate::helpers::oauth_config_helper::getOAuthProviderConfig;
use crate::models::provider_contract_model::PlatformTypeModel;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------- 7TV ----------
#[derive(Debug, Deserialize)]
struct SevenTvHost {
  url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SevenTvEmoteData {
  host: Option<SevenTvHost>,
}

#[derive(Debug, Deserialize)]
struct SevenTvEmoteRow {
  id: String,
  name: String,
  data: Option<SevenTvEmoteData>,
}

#[derive(Debug, Deserialize)]
struct SevenTvGlobalResponse {
  emotes: Option<Vec<SevenTvEmoteRow>>,
}

#[derive(Debug, Deserialize)]
struct SevenTvChannelResponse {
  emote_set: Option<SevenTvEmoteSet>,
}

#[derive(Debug, Deserialize)]
struct SevenTvEmoteSet {
  emotes: Option<Vec<SevenTvEmoteRow>>,
}

// ---------- Twitch badges Helix ----------
#[derive(Debug, Deserialize)]
struct TwitchTokenBody {
  access_token: String,
}

#[derive(Debug, Deserialize)]
struct HelixBadgeVersionRow {
  id: String,
  image_url_1x: Option<String>,
  title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HelixBadgeSetRow {
  set_id: String,
  versions: Vec<HelixBadgeVersionRow>,
}

#[derive(Debug, Deserialize)]
struct HelixBadgeListResponse {
  data: Option<Vec<HelixBadgeSetRow>>,
}

// ---------- Public response models ----------
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SevenTvEmoteIcon {
  pub id: String,
  pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchBadgeIcon {
  pub id: String,
  pub label: String,
  pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconsFetchResponseModel {
  pub emotes: HashMap<String, SevenTvEmoteIcon>, // key: emote name/code
  pub badges: HashMap<String, TwitchBadgeIcon>,  // key: `${badgeKey}/${badgeVersion}`
}

// ---------- Auth helpers ----------
fn twitch_client_credentials() -> Result<(String, Option<String>), String> {
  let cfg = getOAuthProviderConfig(&PlatformTypeModel::Twitch)?;
  Ok((cfg.client_id, cfg.client_secret))
}

async fn twitch_app_access_token(client_id: &str, client_secret: Option<&str>) -> Result<String, String> {
  let client = reqwest::Client::new();
  
  let form = if let Some(secret) = client_secret {
    vec![
      ("client_id", client_id),
      ("client_secret", secret),
      ("grant_type", "client_credentials"),
    ]
  } else {
    return Err("client_secret required for Twitch app access token".to_string());
  };
  
  let response = client
    .post("https://id.twitch.tv/oauth2/token")
    .form(&form)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Err(format!("Twitch token HTTP {}", response.status()));
  }

  let body: TwitchTokenBody = response.json().await.map_err(|e| e.to_string())?;
  Ok(body.access_token)
}

fn normalize_twitch_cdn_url(url: &Option<String>) -> Option<String> {
  let u = url.as_deref()?.trim();
  if u.is_empty() {
    return None;
  }
  if u.starts_with("//") {
    return Some(format!("https:{u}"));
  }
  if u.starts_with("https://") || u.starts_with("http://") {
    return Some(u.to_string());
  }
  None
}

fn build_seven_tv_emote_file_url(host_url: &Option<String>) -> Option<String> {
  let t = host_url.as_deref()?.trim();
  if t.is_empty() {
    return None;
  }

  // 7TV host url is typically `//cdn.7tv.app/emote/{id}`.
  let base: String = if t.starts_with("https://") || t.starts_with("http://") {
    // remove trailing slashes
    t.trim_end_matches('/').to_string()
  } else if t.starts_with("//") {
    format!("https:{}", t).trim_end_matches('/').to_string()
  } else if t.starts_with('/') {
    format!("https://cdn.7tv.app{}", t)
      .trim_end_matches('/')
      .to_string()
  } else {
    return None;
  };

  Some(format!("{base}/1x.webp"))
}

fn build_emote_map(rows: &[SevenTvEmoteRow]) -> HashMap<String, SevenTvEmoteIcon> {
  let mut map = HashMap::new();
  for row in rows {
    if row.name.trim().is_empty() {
      continue;
    }
    let host_url = row
      .data
      .as_ref()
      .and_then(|d| d.host.as_ref())
      .and_then(|h| h.url.clone());
    let url = build_seven_tv_emote_file_url(&host_url);
    if let Some(url) = url {
      map.insert(
        row.name.clone(),
        SevenTvEmoteIcon {
          id: row.id.clone(),
          url,
        },
      );
    }
  }
  map
}

fn build_badge_map(payload: HelixBadgeListResponse) -> HashMap<String, TwitchBadgeIcon> {
  let mut map = HashMap::new();
  for set_row in payload.data.unwrap_or_default() {
    let badge_key = set_row.set_id.clone();
    for v in set_row.versions {
      let compound_key = format!("{}/{}", badge_key, v.id);
      let url = normalize_twitch_cdn_url(&v.image_url_1x);
      if let Some(url) = url {
        map.insert(
          compound_key.clone(),
          TwitchBadgeIcon {
            id: compound_key.clone(),
            label: v.title.unwrap_or_else(|| badge_key.clone()),
            url,
          },
        );
      }
    }
  }
  map
}

// ---------- Commands ----------
#[tauri::command]
pub async fn twitchFetchGlobalIcons() -> Result<IconsFetchResponseModel, String> {
  let (client_id, client_secret) = twitch_client_credentials()?;
  let token = twitch_app_access_token(&client_id, client_secret.as_deref()).await?;

  let client = reqwest::Client::new();

  let badges_fut = client
    .get("https://api.twitch.tv/helix/chat/badges/global")
    .header("Client-Id", client_id)
    .header("Authorization", format!("Bearer {token}"))
    .send();

  let emotes_fut = client.get("https://7tv.io/v3/emote-sets/global").send();

  let (badges_res, emotes_res) = tokio::join!(badges_fut, emotes_fut);

  let badges = badges_res
    .map_err(|e| e.to_string())?
    .json::<HelixBadgeListResponse>()
    .await
    .map_err(|e| e.to_string())?;
  let emotes = emotes_res
    .map_err(|e| e.to_string())?
    .json::<SevenTvGlobalResponse>()
    .await
    .map_err(|e| e.to_string())?;

  Ok(IconsFetchResponseModel {
    emotes: build_emote_map(&emotes.emotes.unwrap_or_default()),
    badges: build_badge_map(badges),
  })
}

#[tauri::command]
pub async fn twitchFetchChannelIcons(roomId: String) -> Result<IconsFetchResponseModel, String> {
  if roomId.trim().is_empty() {
    return Err("roomId required".to_string());
  }

  let (client_id, client_secret) = twitch_client_credentials()?;
  let token = twitch_app_access_token(&client_id, client_secret.as_deref()).await?;

  let client = reqwest::Client::new();

  let badges_fut = client
    .get("https://api.twitch.tv/helix/chat/badges")
    .query(&[("broadcaster_id", roomId.as_str())])
    .header("Client-Id", client_id)
    .header("Authorization", format!("Bearer {token}"))
    .send();

  let emotes_fut = client
    .get(format!("https://7tv.io/v3/users/twitch/{roomId}"))
    .send();

  let (badges_res, emotes_res) = tokio::join!(badges_fut, emotes_fut);

  let badges = badges_res
    .map_err(|e| e.to_string())?
    .json::<HelixBadgeListResponse>()
    .await
    .map_err(|e| e.to_string())?;
  let emotes = emotes_res
    .map_err(|e| e.to_string())?
    .json::<SevenTvChannelResponse>()
    .await
    .map_err(|e| e.to_string())?;

  let emote_rows = emotes.emote_set.and_then(|s| s.emotes).unwrap_or_default();

  Ok(IconsFetchResponseModel {
    emotes: build_emote_map(&emote_rows),
    badges: build_badge_map(badges),
  })
}
