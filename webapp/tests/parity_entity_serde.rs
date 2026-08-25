//! Regression gate: entity serde round-trips keep master's camelCase field
//! names (`docs/parity/test-plan.md` §Regression gates).
//!
//! Golden JSON constants mirror the field names on `master` (Angular
//! `chat.model.ts` + src-tauri models). Each entity is deserialized from the
//! golden document, re-serialized, and compared structurally (key order
//! tolerant, like master's consumers).

use unichat_webapp::domain::entities::*;

/// Assert a golden JSON round-trips through `T` unchanged.
fn roundtrip<T: serde::Serialize + serde::de::DeserializeOwned>(golden: &str) {
    let entity: T = serde_json::from_str(golden)
        .unwrap_or_else(|e| panic!("golden must deserialize into {}: {e}", std::any::type_name::<T>()));
    let reserialized = serde_json::to_value(&entity).expect("serialize");
    let expected: serde_json::Value = serde_json::from_str(golden).unwrap();
    assert_eq!(
        reserialized, expected,
        "{} round-trip diverged from master field names",
        std::any::type_name::<T>()
    );
}

#[test]
fn chat_message_keeps_master_camel_case() {
    roundtrip::<ChatMessage>(r#"{
        "id": "m-1", "platform": "twitch",
        "sourceMessageId": "sm-1", "sourceChannelId": "c-1",
        "sourceUserId": "u-1", "author": "alice", "text": "hi",
        "badges": ["broadcaster/1"], "isSupporter": true,
        "isOutgoing": false, "isDeleted": false,
        "canRenderInOverlay": true,
        "replyToMessageId": null,
        "messageType": "regular", "messageTypeReason": null,
        "sequenceNumber": 7, "receivedAt": 1700000000000,
        "createdAt": null, "updatedAt": null, "deletedAt": null
    }"#);
}

#[test]
fn chat_message_create_keeps_master_camel_case() {
    roundtrip::<ChatMessageCreate>(r#"{
        "platform": "kick", "sourceMessageId": "sm-2",
        "sourceChannelId": "c-2", "sourceUserId": "u-2",
        "author": "bob", "text": "yo", "badges": null,
        "isSupporter": false, "isOutgoing": false,
        "canRenderInOverlay": true, "replyToMessageId": null,
        "messageType": null, "sequenceNumber": 1
    }"#);
}

#[test]
fn chat_channel_keeps_master_camel_case() {
    roundtrip::<ChatChannel>(r#"{
        "id": "ch-1", "platform": "youtube",
        "channelId": "UC9", "channelName": "Chan",
        "channelImageUrl": "https://img.test/x.png",
        "isAuthorized": true, "accountId": "acc-1",
        "accountCapabilities": {"canModerate": true},
        "isVisible": true,
        "createdAt": null, "updatedAt": null, "deletedAt": null
    }"#);
}

#[test]
fn chat_channel_create_keeps_master_camel_case() {
    roundtrip::<ChatChannelCreate>(r#"{
        "platform": "twitch", "channelId": "c-3",
        "channelName": "Name", "channelImageUrl": null,
        "isAuthorized": false, "accountId": null,
        "accountCapabilities": null, "isVisible": true
    }"#);
}

#[test]
fn chat_account_keeps_master_camel_case() {
    roundtrip::<ChatAccount>(r#"{
        "id": "a-1", "platform": "twitch", "username": "alice",
        "userId": "u-1", "avatarUrl": "https://img.test/a.png",
        "authStatus": "authorized", "accessToken": "at",
        "refreshToken": "rt",
        "tokenExpiresAt": "2026-01-01T00:00:00Z",
        "createdAt": null, "updatedAt": null, "deletedAt": null
    }"#);
}

#[test]
fn chat_account_create_keeps_master_camel_case() {
    // Fixture from docs/parity/test-plan.md §T4.
    roundtrip::<ChatAccountCreate>(r#"{
        "platform": "twitch", "username": "alice", "userId": "u-1",
        "avatarUrl": null, "authStatus": "authorized",
        "accessToken": "at", "refreshToken": "rt",
        "tokenExpiresAt": null
    }"#);
}

#[test]
fn custom_emote_keeps_master_camel_case() {
    roundtrip::<CustomEmote>(r#"{
        "id": "e-1", "platform": "twitch", "channelId": null,
        "emoteCode": "uniKappa", "emoteUrl": "https://cdn.test/k.png",
        "emoteType": "custom",
        "createdAt": null, "updatedAt": null, "deletedAt": null
    }"#);
}

#[test]
fn custom_emote_create_keeps_master_camel_case() {
    roundtrip::<CustomEmoteCreate>(r#"{
        "platform": "twitch", "channelId": "c-1",
        "emoteCode": "uniKappa", "emoteUrl": "https://cdn.test/k.png",
        "emoteType": "custom"
    }"#);
}

#[test]
fn dashboard_preferences_keeps_master_camel_case_and_defaults() {
    roundtrip::<DashboardPreferences>(r#"{
        "id": "default",
        "feedMode": "mixed", "densityMode": "comfortable",
        "autoScroll": true,
        "splitLayout": {
            "orderedPlatforms": ["twitch", "kick", "youtube"],
            "hiddenPlatforms": [],
            "columnWidths": {"twitch": 33, "kick": 33, "youtube": 34}
        },
        "mixedEnabledChannelIds": []
    }"#);

    // Defaults match master's get_or_create seed values.
    let d = DashboardPreferences::default();
    assert_eq!(d.feed_mode, "mixed");
    assert_eq!(d.density_mode, "comfortable");
    assert!(d.auto_scroll);
    assert_eq!(d.split_layout["orderedPlatforms"][0], "twitch");
}

#[test]
fn dashboard_preferences_update_keeps_master_camel_case() {
    roundtrip::<DashboardPreferencesUpdate>(r#"{
        "feedMode": null, "densityMode": "cozy",
        "autoScroll": false, "splitLayout": null,
        "mixedEnabledChannelIds": ["twitch:c-1"]
    }"#);
}

#[test]
fn irc_types_keep_master_camel_case() {
    roundtrip::<IrcMessage>(r##"{
        "id": "twitch-c-111-1700000000000", "platform": "twitch",
        "channelId": "c-1", "channelName": "chan",
        "author": "alice", "authorId": "111", "text": "Kappa",
        "timestamp": 1700000000000,
        "badges": [{"setId": "broadcaster", "id": "1", "version": ""}],
        "color": "#FF0000",
        "emotes": [{"id": "25", "code": "0-4", "urls": ["u"]}],
        "isMod": false, "isSubscriber": false, "isHighlighted": false
    }"##);
}

#[test]
fn auth_status_keeps_master_camel_case() {
    roundtrip::<AuthStatus>(r#"{
        "platform": "twitch", "isConnected": true,
        "username": "alice", "expiresAt": "2026-01-01T00:00:00Z"
    }"#);
}

#[test]
fn platform_serializes_like_master_lowercase() {
    for (value, json) in [
        (Platform::Twitch, "\"twitch\""),
        (Platform::Kick, "\"kick\""),
        (Platform::Youtube, "\"youtube\""),
    ] {
        assert_eq!(serde_json::to_string(&value).unwrap(), json);
    }
}

#[test]
fn overlay_types_keep_master_camel_case() {
    roundtrip::<OverlayConfig>(r#"{
        "port": 8791, "enabled": true,
        "sources": [
            {"id": "s-1", "channelId": "c-1",
             "platform": "twitch", "enabled": true}
        ]
    }"#);
    roundtrip::<OverlayMessage>(r##"{
        "id": "m-1", "platform": "twitch", "channelId": "c-1",
        "author": "alice", "text": "hi", "timestamp": 1700000000000,
        "color": "#FFFFFF"
    }"##);
}

#[test]
fn storage_update_and_platform_info_types_keep_camel_case() {
    roundtrip::<StorageEntry>(r#"{"key": "k", "value": [1, 2]}"#);
    roundtrip::<UpdateInfo>(r#"{
        "version": "1.2.0", "releaseDate": "2026-01-01",
        "downloadUrl": "http://mock/uc.AppImage", "releaseNotes": "n"
    }"#);
    roundtrip::<VersionInfo>(r#"{"current": "0.4.0", "latest": "1.2.0"}"#);
    roundtrip::<KickChatroomInfo>(r#"{"chatroomId": "55555", "channelId": "ch"}"#);
    roundtrip::<KickUserInfo>(r#"{"userId": "u", "username": "n", "avatarUrl": null}"#);
    roundtrip::<YouTubeChannelInfo>(r#"{"channelId": "UC9", "title": "T", "thumbnailUrl": null}"#);
}
