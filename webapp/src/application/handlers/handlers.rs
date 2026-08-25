//! UniChat KAS Handlers
//!
//! Async command/handler functions for all UniChat operations.
//! These are called by the KAS system and return `Result<Response<T>>`.
//!
//! CRUD handlers persist through the process-wide nosql_orm JSON provider
//! (`infrastructure::data_store`), mirroring `master`'s generic CRUD engine
//! over the five aggregates. Platform transport, auth, overlay server and
//! update handlers remain registered gaps (see docs/parity).
use std::sync::Arc;

use dioxus_shared::error::AppError;
use dioxus_shared::response::{Response, Status};
use dioxus_shared::result::Result as SharedResult;
use nosql_orm::prelude::*;

use crate::domain::entities::*;
use crate::domain::irc::parse_twitch_message;
use crate::infrastructure::data_store::{
    self, CHAT_ACCOUNTS, CHAT_CHANNELS, CHAT_MESSAGES, CUSTOM_EMOTES,
    DASHBOARD_PREFERENCES, DEFAULT_DASHBOARD_PREFERENCES_ID,
};

pub type UnichatResult<T> = SharedResult<Response<T>>;
type StepResult<T> = std::result::Result<T, AppError>;

/// Borrow the initialized data provider as an application error.
fn store() -> StepResult<Arc<JsonProvider>> {
    data_store::data_provider().map_err(AppError::Internal)
}

fn to_json<T: serde::Serialize>(value: &T) -> StepResult<serde_json::Value> {
    Ok(normalize_doc(serde_json::to_value(value)?))
}
fn from_json<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> StepResult<T> {
    Ok(serde_json::from_value(value)?)
}

fn json_vec<T: serde::de::DeserializeOwned>(
    docs: Vec<serde_json::Value>,
) -> StepResult<Vec<T>> {
    docs.into_iter()
        .map(|d| serde_json::from_value(d).map_err(AppError::from))
        .collect()
}

/// Remove keys whose value is `null` so optional fields behave like absent
/// ones when deserialized back (master's documents never carried nulls).
fn normalize_doc(mut value: serde_json::Value) -> serde_json::Value {
    if let Some(obj) = value.as_object_mut() {
        obj.retain(|_, v| !v.is_null());
    }
    value
}

/// Build a nosql_orm filter from camelCase field matchers.
fn eq_filter(fields: &[(&str, String)]) -> StepResult<Filter> {
    let mut obj = serde_json::Map::new();
    for (key, value) in fields {
        obj.insert((*key).to_string(), serde_json::Value::String(value.clone()));
    }
    Filter::from_json(&serde_json::Value::Object(obj))
        .map_err(|e| AppError::Database(e.to_string()))
}

async fn find_by_id_entity(
    collection: &str,
    id: &str,
) -> StepResult<Option<serde_json::Value>> {
    Ok(store()?
        .find_by_id(collection, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?)
}


// ============================================================================
// Chat Message Handlers
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageFilter {
    pub platform: Option<String>,
    pub channel_id: Option<String>,
    pub author_id: Option<String>,
}

pub async fn create_chat_message(
    input: ChatMessageCreate,
) -> UnichatResult<ChatMessage> {
    let doc = to_json(&input)?;
    let created = store()?
        .insert(CHAT_MESSAGES, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::created(from_json(created)?))
}

pub async fn get_chat_message(id: String) -> UnichatResult<ChatMessage> {
    match find_by_id_entity(CHAT_MESSAGES, &id).await? {
        Some(doc) => Ok(Response::success(from_json(doc)?, Some("Found"))),
        None => Ok(Response::error("Not found")),
    }
}

pub async fn get_chat_messages(
    filter: Option<ChatMessageFilter>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> UnichatResult<Vec<ChatMessage>> {
    let provider = store()?;
    let orm_filter = match filter {
        Some(f) => {
            let mut fields: Vec<(&str, String)> = Vec::new();
            if let Some(p) = f.platform {
                fields.push(("platform", p));
            }
            if let Some(c) = f.channel_id {
                fields.push(("sourceChannelId", c));
            }
            if let Some(a) = f.author_id {
                fields.push(("sourceUserId", a));
            }
            Some(eq_filter(&fields)?)
        }
        None => None,
    };
    let docs = provider
        .find_many(
            CHAT_MESSAGES,
            orm_filter.as_ref(),
            offset.map(u64::from),
            limit.map(u64::from),
            Some("createdAt"),
            true,
        )
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(json_vec(docs)?, Some("Found")))
}

pub async fn update_chat_message(
    id: String,
    input: ChatMessageCreate,
) -> UnichatResult<ChatMessage> {
    let mut doc = to_json(&input)?;
    if let Some(obj) = doc.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(id.clone()));
    }
    let updated = store()?
        .update(CHAT_MESSAGES, &id, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(updated)?))
}

pub async fn patch_chat_message(
    id: String,
    patch: serde_json::Value,
) -> UnichatResult<ChatMessage> {
    let patched = store()?
        .patch(CHAT_MESSAGES, &id, patch)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(patched)?))
}

pub async fn delete_chat_message(id: String) -> UnichatResult<()> {
    store()?
        .delete(CHAT_MESSAGES, &id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::deleted(()))
}

pub async fn get_chat_messages_by_channel(
    channel_id: String,
) -> UnichatResult<Vec<ChatMessage>> {
    let filter = eq_filter(&[("sourceChannelId", channel_id)])?;
    let docs = store()?
        .find_many(CHAT_MESSAGES, Some(&filter), None, None, Some("createdAt"), true)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(json_vec(docs)?, Some("Found")))
}

pub async fn delete_chat_messages_by_channel(
    channel_id: String,
) -> UnichatResult<u64> {
    // Master loops find-then-delete per id and reports the exact count.
    let provider = store()?;
    let filter = eq_filter(&[("sourceChannelId", channel_id)])?;
    let docs = provider
        .find_many(CHAT_MESSAGES, Some(&filter), None, None, None, true)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    let mut deleted_count = 0u64;
    for doc in docs {
        if let Some(id) = doc.get("id").and_then(|v| v.as_str()) {
            let id = id.to_string();
            if provider
                .delete(CHAT_MESSAGES, &id)
                .await
                .is_ok()
            {
                deleted_count += 1;
            }
        }
    }
    Ok(Response::success(deleted_count, Some("Deleted")))
}

// ============================================================================
// Chat Account Handlers
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAccountFilter {
    pub platform: Option<Platform>,
    pub user_id: Option<String>,
}

pub async fn create_chat_account(
    input: ChatAccountCreate,
) -> UnichatResult<ChatAccount> {
    let doc = to_json(&input)?;
    let created = store()?
        .insert(CHAT_ACCOUNTS, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::created(from_json(created)?))
}

pub async fn get_chat_account(id: String) -> UnichatResult<ChatAccount> {
    match find_by_id_entity(CHAT_ACCOUNTS, &id).await? {
        Some(doc) => Ok(Response::success(from_json(doc)?, Some("Found"))),
        None => Ok(Response::error("Not found")),
    }
}

pub async fn get_chat_accounts(
    filter: Option<ChatAccountFilter>,
) -> UnichatResult<Vec<ChatAccount>> {
    let orm_filter = match filter {
        Some(f) => {
            let mut fields: Vec<(&str, String)> = Vec::new();
            if let Some(p) = f.platform {
                fields.push(("platform", platform_key(&p)));
            }
            if let Some(u) = f.user_id {
                fields.push(("userId", u));
            }
            Some(eq_filter(&fields)?)
        }
        None => None,
    };
    let docs = store()?
        .find_many(CHAT_ACCOUNTS, orm_filter.as_ref(), None, None, Some("createdAt"), true)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(json_vec(docs)?, Some("Found")))
}

pub async fn update_chat_account(
    id: String,
    input: ChatAccountCreate,
) -> UnichatResult<ChatAccount> {
    let mut doc = to_json(&input)?;
    if let Some(obj) = doc.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(id.clone()));
    }
    let updated = store()?
        .update(CHAT_ACCOUNTS, &id, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(updated)?))
}

pub async fn patch_chat_account(
    id: String,
    patch: serde_json::Value,
) -> UnichatResult<ChatAccount> {
    let patched = store()?
        .patch(CHAT_ACCOUNTS, &id, patch)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(patched)?))
}

pub async fn delete_chat_account(id: String) -> UnichatResult<()> {
    store()?
        .delete(CHAT_ACCOUNTS, &id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::deleted(()))
}

pub async fn get_chat_account_by_platform_and_user(
    platform: Platform,
    user_id: String,
) -> UnichatResult<ChatAccount> {
    let filter = eq_filter(&[("platform", platform_key(&platform)), ("userId", user_id)])?;
    let docs = store()?
        .find_many(CHAT_ACCOUNTS, Some(&filter), None, Some(1), None, true)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    match docs.first() {
        Some(doc) => Ok(Response::success(from_json(doc.clone())?, Some("Found"))),
        // Master returns a `Status::Error` envelope reading "Account not found".
        None => Ok(Response {
            status: Status::Error,
            message: "Account not found".to_string(),
            data: None,
        }),
    }
}

pub async fn get_chat_accounts_by_platform(
    platform: Platform,
) -> UnichatResult<Vec<ChatAccount>> {
    let filter = eq_filter(&[("platform", platform_key(&platform))])?;
    let docs = store()?
        .find_many(CHAT_ACCOUNTS, Some(&filter), None, None, Some("createdAt"), false)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(json_vec(docs)?, Some("Found")))
}

/// Serialize [`Platform`] into its stored key form (`"twitch"`, …).
fn platform_key(platform: &Platform) -> String {
    serde_json::to_value(platform)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

// ============================================================================
// Chat Channel Handlers
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatChannelFilter {
    pub platform: Option<Platform>,
    pub account_id: Option<String>,
}

pub async fn create_chat_channel(
    input: ChatChannelCreate,
) -> UnichatResult<ChatChannel> {
    let doc = to_json(&input)?;
    let created = store()?
        .insert(CHAT_CHANNELS, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::created(from_json(created)?))
}

pub async fn get_chat_channel(id: String) -> UnichatResult<ChatChannel> {
    match find_by_id_entity(CHAT_CHANNELS, &id).await? {
        Some(doc) => Ok(Response::success(from_json(doc)?, Some("Found"))),
        None => Ok(Response::error("Not found")),
    }
}

pub async fn get_chat_channels(
    filter: Option<ChatChannelFilter>,
) -> UnichatResult<Vec<ChatChannel>> {
    let orm_filter = match filter {
        Some(f) => {
            let mut fields: Vec<(&str, String)> = Vec::new();
            if let Some(p) = f.platform {
                fields.push(("platform", platform_key(&p)));
            }
            if let Some(a) = f.account_id {
                fields.push(("accountId", a));
            }
            Some(eq_filter(&fields)?)
        }
        None => None,
    };
    let docs = store()?
        .find_many(CHAT_CHANNELS, orm_filter.as_ref(), None, None, Some("createdAt"), true)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(json_vec(docs)?, Some("Found")))
}

pub async fn update_chat_channel(
    id: String,
    input: ChatChannelCreate,
) -> UnichatResult<ChatChannel> {
    let mut doc = to_json(&input)?;
    if let Some(obj) = doc.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(id.clone()));
    }
    let updated = store()?
        .update(CHAT_CHANNELS, &id, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(updated)?))
}

pub async fn patch_chat_channel(
    id: String,
    patch: serde_json::Value,
) -> UnichatResult<ChatChannel> {
    let patched = store()?
        .patch(CHAT_CHANNELS, &id, patch)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(patched)?))
}

pub async fn delete_chat_channel(id: String) -> UnichatResult<()> {
    store()?
        .delete(CHAT_CHANNELS, &id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::deleted(()))
}

pub async fn get_chat_channel_by_platform_and_id(
    platform: Platform,
    channel_id: String,
) -> UnichatResult<ChatChannel> {
    let filter =
        eq_filter(&[("platform", platform_key(&platform)), ("channelId", channel_id)])?;
    let docs = store()?
        .find_many(CHAT_CHANNELS, Some(&filter), None, Some(1), None, true)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    match docs.first() {
        Some(doc) => Ok(Response::success(from_json(doc.clone())?, Some("Found"))),
        None => Ok(Response::error("Not found")),
    }
}

// ============================================================================
// Custom Emote Handlers
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEmoteFilter {
    pub platform: Option<Platform>,
    pub channel_id: Option<String>,
}

pub async fn create_custom_emote(
    input: CustomEmoteCreate,
) -> UnichatResult<CustomEmote> {
    let doc = to_json(&input)?;
    let created = store()?
        .insert(CUSTOM_EMOTES, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::created(from_json(created)?))
}

pub async fn get_custom_emote(id: String) -> UnichatResult<CustomEmote> {
    match find_by_id_entity(CUSTOM_EMOTES, &id).await? {
        Some(doc) => Ok(Response::success(from_json(doc)?, Some("Found"))),
        None => Ok(Response::error("Not found")),
    }
}

pub async fn get_custom_emotes(
    filter: Option<CustomEmoteFilter>,
) -> UnichatResult<Vec<CustomEmote>> {
    let orm_filter = match filter {
        Some(f) => {
            let mut fields: Vec<(&str, String)> = Vec::new();
            if let Some(p) = f.platform {
                fields.push(("platform", platform_key(&p)));
            }
            if let Some(c) = f.channel_id {
                fields.push(("channelId", c));
            }
            Some(eq_filter(&fields)?)
        }
        None => None,
    };
    let docs = store()?
        .find_many(CUSTOM_EMOTES, orm_filter.as_ref(), None, None, Some("createdAt"), true)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(json_vec(docs)?, Some("Found")))
}

pub async fn update_custom_emote(
    id: String,
    input: CustomEmoteCreate,
) -> UnichatResult<CustomEmote> {
    let mut doc = to_json(&input)?;
    if let Some(obj) = doc.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(id.clone()));
    }
    let updated = store()?
        .update(CUSTOM_EMOTES, &id, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(updated)?))
}

pub async fn patch_custom_emote(
    id: String,
    patch: serde_json::Value,
) -> UnichatResult<CustomEmote> {
    let patched = store()?
        .patch(CUSTOM_EMOTES, &id, patch)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(patched)?))
}

pub async fn delete_custom_emote(id: String) -> UnichatResult<()> {
    store()?
        .delete(CUSTOM_EMOTES, &id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::deleted(()))
}

pub async fn get_custom_emotes_by_platform(
    platform: Platform,
) -> UnichatResult<Vec<CustomEmote>> {
    let filter = eq_filter(&[("platform", platform_key(&platform))])?;
    let docs = store()?
        .find_many(CUSTOM_EMOTES, Some(&filter), None, None, Some("createdAt"), true)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(json_vec(docs)?, Some("Found")))
}

// ============================================================================
// Dashboard Preferences Handlers
// ============================================================================

pub async fn create_dashboard_preferences(
    input: DashboardPreferences,
) -> UnichatResult<DashboardPreferences> {
    let doc = to_json(&input)?;
    let created = store()?
        .insert(DASHBOARD_PREFERENCES, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::created(from_json(created)?))
}

pub async fn get_dashboard_preferences(
    id: String,
) -> UnichatResult<DashboardPreferences> {
    match find_by_id_entity(DASHBOARD_PREFERENCES, &id).await? {
        Some(doc) => Ok(Response::success(from_json(doc)?, Some("Found"))),
        None => Ok(Response::error("Not found")),
    }
}

pub async fn get_dashboard_preferences_list(
) -> UnichatResult<Vec<DashboardPreferences>> {
    let docs = store()?
        .find_all(DASHBOARD_PREFERENCES)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(json_vec(docs)?, Some("Found")))
}

pub async fn update_dashboard_preferences(
    id: String,
    input: DashboardPreferencesUpdate,
) -> UnichatResult<DashboardPreferences> {
    // `DashboardPreferencesUpdate` is a partial document, so the update
    // merges over the stored doc (a full replace would drop unspecified
    // required fields).
    let mut doc = to_json(&input)?;
    if let Some(obj) = doc.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(id.clone()));
    }
    let updated = store()?
        .patch(DASHBOARD_PREFERENCES, &id, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(updated)?))
}

pub async fn patch_dashboard_preferences(
    id: String,
    patch: serde_json::Value,
) -> UnichatResult<DashboardPreferences> {
    let patched = store()?
        .patch(DASHBOARD_PREFERENCES, &id, patch)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::updated(from_json(patched)?))
}

pub async fn delete_dashboard_preferences(
    id: String,
) -> UnichatResult<()> {
    store()?
        .delete(DASHBOARD_PREFERENCES, &id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::deleted(()))
}

/// Singleton preferences document: return it when present, otherwise insert
/// the master defaults under [`DEFAULT_DASHBOARD_PREFERENCES_ID`]. Repeated
/// calls always yield the same id.
///
/// Divergence note: master keys this by a `user_id` argument; the ported
/// signature takes none.
pub async fn get_or_create_dashboard_preferences(
) -> UnichatResult<DashboardPreferences> {
    let provider = store()?;
    if let Some(doc) = provider
        .find_by_id(DASHBOARD_PREFERENCES, DEFAULT_DASHBOARD_PREFERENCES_ID)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
    {
        return Ok(Response::success(from_json(doc)?, Some("Found")));
    }
    let mut doc = to_json(&DashboardPreferences::default())?;
    if let Some(obj) = doc.as_object_mut() {
        obj.insert(
            "id".to_string(),
            serde_json::Value::String(DEFAULT_DASHBOARD_PREFERENCES_ID.to_string()),
        );
    }
    let created = provider
        .insert(DASHBOARD_PREFERENCES, doc)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Response::success(from_json(created)?, Some("Created")))
}

// ============================================================================
// Twitch IRC Handlers
// ============================================================================
//
// The websocket transport behind join/leave/send/is_connected is a registered
// parity gap (`TwitchIrcClient` stub); only pure parsing is implemented.

use crate::infrastructure::api::TwitchIrcClient;

pub async fn twitch_irc_join_channel(
    channel_id: String,
    channel_name: String,
    username: String,
    oauth_token: String,
) -> UnichatResult<()> {
    TwitchIrcClient::new()
        .join_channel(&channel_id, &channel_name, &username, &oauth_token)
        .await
        .map_err(AppError::Internal)?;
    Ok(Response::success((), Some("Joined channel")))
}

pub async fn twitch_irc_leave_channel(
    _channel_id: String,
    _channel_name: String,
) -> UnichatResult<()> {
    Ok(Response::success((), Some("Left channel")))
}

pub async fn twitch_irc_send_message(
    _channel_id: String,
    _channel_name: String,
    _message: String,
) -> UnichatResult<()> {
    Ok(Response::success((), Some("Message sent")))
}

pub async fn twitch_irc_is_connected(
    _channel_id: String,
    _channel_name: String,
) -> UnichatResult<bool> {
    Ok(Response::success(false, Some("Retrieved")))
}

pub async fn parse_irc_message(
    raw: String,
    channel_id: String,
    channel_name: String,
) -> UnichatResult<Option<IrcMessage>> {
    Ok(Response::success(
        parse_twitch_message(&raw, &channel_id, &channel_name),
        Some("Parsed"),
    ))
}

// ============================================================================
// Twitch API Handlers
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchIcon {
    pub url: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

pub async fn twitch_fetch_global_icons(
) -> UnichatResult<Vec<TwitchIcon>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

pub async fn twitch_fetch_channel_icons(
    _channel_id: String,
) -> UnichatResult<Vec<TwitchIcon>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

pub async fn twitch_delete_message(
    _channel_id: String,
    _message_id: String,
    _oauth_token: String,
) -> UnichatResult<()> {
    Ok(Response::success((), Some("Deleted")))
}

pub async fn twitch_fetch_channel_emotes(
    _channel_id: String,
) -> UnichatResult<Vec<CustomEmote>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

// ============================================================================
// Kick Handlers
// ============================================================================

pub async fn kick_fetch_chatroom_id(
    _channel_name: String,
) -> UnichatResult<KickChatroomInfo> {
    Ok(Response::success(
        KickChatroomInfo {
            chatroom_id: String::new(),
            channel_id: String::new(),
        },
        Some("Retrieved"),
    ))
}

pub async fn kick_fetch_recent_messages(
    _chatroom_id: String,
    _limit: Option<i32>,
) -> UnichatResult<Vec<ChatMessage>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

pub async fn kick_fetch_user_info(
    _username: String,
) -> UnichatResult<KickUserInfo> {
    Ok(Response::success(
        KickUserInfo {
            user_id: String::new(),
            username: String::new(),
            avatar_url: None,
        },
        Some("Retrieved"),
    ))
}

pub async fn kick_fetch_channel_emotes(
    _channel_id: String,
) -> UnichatResult<Vec<CustomEmote>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

pub async fn kick_fetch_channel_info(
    _channel_id: String,
) -> UnichatResult<ChatChannel> {
    Ok(Response::success(ChatChannel::default(), Some("Retrieved")))
}

pub async fn kick_send_chat_message(
    _chatroom_id: String,
    _message: String,
    _oauth_token: String,
) -> UnichatResult<()> {
    Ok(Response::success((), Some("Sent")))
}

pub async fn kick_delete_chat_message(
    _chatroom_id: String,
    _message_id: String,
    _oauth_token: String,
) -> UnichatResult<()> {
    Ok(Response::success((), Some("Deleted")))
}

// ============================================================================
// YouTube Handlers
// ============================================================================

pub async fn youtube_fetch_channel_info_by_api_key(
    _channel_id: String,
    _api_key: String,
) -> UnichatResult<YouTubeChannelInfo> {
    Ok(Response::success(
        YouTubeChannelInfo {
            channel_id: String::new(),
            title: String::new(),
            thumbnail_url: None,
        },
        Some("Retrieved"),
    ))
}

pub async fn youtube_fetch_chat_messages(
    _live_chat_id: String,
    _api_key: String,
    _max_results: Option<i32>,
) -> UnichatResult<Vec<ChatMessage>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

pub async fn youtube_fetch_live_video_id_by_api_key(
    _channel_id: String,
    _api_key: String,
) -> UnichatResult<Option<String>> {
    Ok(Response::success(None, Some("Retrieved")))
}

// ============================================================================
// Auth Handlers
// ============================================================================

pub async fn auth_start(_platform: Platform) -> UnichatResult<String> {
    Ok(Response::success(String::new(), Some("Started")))
}

pub async fn auth_await_callback(
    _platform: Platform,
) -> UnichatResult<AuthStatus> {
    Ok(Response::success(default_auth_status(), Some("Completed")))
}

pub async fn auth_complete(
    _platform: Platform,
    _code: String,
) -> UnichatResult<ChatAccount> {
    Ok(Response::success(ChatAccount::default(), Some("Completed")))
}

pub async fn auth_status(_platform: Platform) -> UnichatResult<AuthStatus> {
    Ok(Response::success(default_auth_status(), Some("Retrieved")))
}

pub async fn auth_validate(_platform: Platform) -> UnichatResult<bool> {
    Ok(Response::success(false, Some("Validated")))
}

pub async fn auth_refresh(_platform: Platform) -> UnichatResult<()> {
    Ok(Response::success((), Some("Refreshed")))
}

pub async fn auth_disconnect(_platform: Platform) -> UnichatResult<()> {
    Ok(Response::success((), Some("Disconnected")))
}

// ============================================================================
// Overlay Server Handlers
// ============================================================================

pub async fn start_overlay_server(_port: u16) -> UnichatResult<()> {
    Ok(Response::success((), Some("Started")))
}

pub async fn stop_overlay_server() -> UnichatResult<()> {
    Ok(Response::success((), Some("Stopped")))
}

pub async fn open_overlay_window() -> UnichatResult<()> {
    Ok(Response::success((), Some("Opened")))
}

pub async fn emit_overlay_config_changed(
    _config: OverlayConfig,
) -> UnichatResult<()> {
    Ok(Response::success((), Some("Emitted")))
}

pub async fn init_overlay_config_from_storage(
) -> UnichatResult<OverlayConfig> {
    Ok(Response::success(default_overlay_config(), Some("Initialized")))
}

pub async fn get_overlay_config() -> UnichatResult<OverlayConfig> {
    Ok(Response::success(default_overlay_config(), Some("Retrieved")))
}

pub async fn get_overlay_messages(
    _limit: Option<u32>,
) -> UnichatResult<Vec<OverlayMessage>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

#[allow(dead_code)]
fn default_auth_status() -> AuthStatus {
    AuthStatus {
        platform: Platform::Twitch,
        is_connected: false,
        username: None,
        expires_at: None,
    }
}

#[allow(dead_code)]
fn default_overlay_config() -> OverlayConfig {
    OverlayConfig {
        port: 0,
        enabled: false,
        sources: vec![],
    }
}

// ============================================================================
// Storage Handlers
// ============================================================================

// Key/value storage handlers remain canned stubs: master's storage commands
// run over its nosql_orm key-value store, while the ported `LocalStorage` is
// process-memory only and disconnected from handlers (parity report row 11,
// registered gap — out of scope for this pass).

pub async fn storage_get(_key: String) -> UnichatResult<Option<serde_json::Value>> {
    Ok(Response::success(None, Some("Retrieved")))
}

pub async fn storage_set(
    _key: String,
    _value: serde_json::Value,
) -> UnichatResult<()> {
    Ok(Response::success((), Some("Set")))
}

pub async fn storage_remove(_key: String) -> UnichatResult<()> {
    Ok(Response::success((), Some("Removed")))
}

pub async fn storage_clear() -> UnichatResult<()> {
    Ok(Response::success((), Some("Cleared")))
}

pub async fn storage_keys() -> UnichatResult<Vec<String>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

pub async fn query_storage(
    _filter: serde_json::Value,
) -> UnichatResult<Vec<StorageEntry>> {
    Ok(Response::success(vec![], Some("Retrieved")))
}

pub async fn count_storage() -> UnichatResult<u64> {
    Ok(Response::success(0u64, Some("Counted")))
}

pub async fn exists_storage(_key: String) -> UnichatResult<bool> {
    Ok(Response::success(false, Some("Checked")))
}

// ============================================================================
// Update Handlers
// ============================================================================

pub async fn check_for_update() -> UnichatResult<Option<UpdateInfo>> {
    Ok(Response::success(None, Some("Checked")))
}

pub async fn download_update(
    _version: String,
) -> UnichatResult<()> {
    Ok(Response::success((), Some("Downloaded")))
}

pub async fn install_update() -> UnichatResult<()> {
    Ok(Response::success((), Some("Installed")))
}

pub async fn get_current_version() -> UnichatResult<VersionInfo> {
    Ok(Response::success(
        VersionInfo {
            current: env!("CARGO_PKG_VERSION").to_string(),
            latest: None,
        },
        Some("Retrieved"),
    ))
}

// ============================================================================
// CRUD Handler
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrudExecuteInput {
    pub entity: String,
    pub operation: String,
    pub id: Option<String>,
    pub data: Option<serde_json::Value>,
    pub filter: Option<serde_json::Value>,
}

/// Generic CRUD passthrough over the same JSON provider as master's
/// `crud_execute`.
pub async fn crud_execute(input: CrudExecuteInput) -> UnichatResult<serde_json::Value> {
    let service = dioxus_shared::crud::CrudService::new(store()?);
    let response = service
        .execute(
            &input.operation,
            &input.entity,
            input.id.as_deref(),
            input.data,
            input.filter,
        )
        .await
        .map_err(AppError::Internal)?;
    Ok(response)
}
