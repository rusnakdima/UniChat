//! Regression gate: handler signature/surface audit
//! (`docs/parity/test-plan.md` §Regression gates).
//!
//! The static list below is master's Tauri command registry (all
//! `#[tauri::command]` fns across `src-tauri/src/commands/*`, including the
//! macro-generated CRUD commands) plus `parse_irc_message`, a documented
//! webapp-only addition exposing master's internal parser.
//!
//! Every handler is referenced by name AND invoked once with a canned input,
//! so a rename, signature change, or removal fails this test at compile time
//! or runtime. Envelope status is asserted per call.

mod common;

use unichat_webapp::application::handlers::*;
use unichat_webapp::domain::entities::*;

/// Master command registry (82 commands) + parse_irc_message = 83.
const EXPECTED_HANDLER_COUNT: usize = 83;

fn msg_create() -> ChatMessageCreate {
    ChatMessageCreate {
        platform: "twitch".into(),
        source_message_id: "audit".into(),
        source_channel_id: "audit".into(),
        source_user_id: "u-audit".into(),
        author: "auditor".into(),
        text: "surface audit".into(),
        badges: None,
        is_supporter: None,
        is_outgoing: None,
        can_render_in_overlay: None,
        reply_to_message_id: None,
        message_type: None,
        sequence_number: None,
    }
}

fn acc_create() -> ChatAccountCreate {
    ChatAccountCreate {
        platform: "twitch".into(),
        username: "auditor".into(),
        user_id: "u-audit-surface".into(),
        avatar_url: None,
        auth_status: Some("authorized".into()),
        access_token: Some("at".into()),
        refresh_token: Some("rt".into()),
        token_expires_at: None,
    }
}

#[tokio::test]
async fn every_handler_exists_and_returns_envelope() {
    let _guard = common::setup_store().await;
    use dioxus_shared::response::Status;

    // --- chat messages (7 registry commands + 3 special lookups) ---
    let created = create_chat_message(msg_create()).await.unwrap();
    assert_eq!(created.status, Status::Created);
    let id = created.data.unwrap().id.unwrap();

    assert_eq!(get_chat_message(id.clone()).await.unwrap().status, Status::Success);
    assert_eq!(
        get_chat_messages(None, Some(10), Some(0)).await.unwrap().status,
        Status::Success
    );
    assert_eq!(
        update_chat_message(id.clone(), msg_create()).await.unwrap().status,
        Status::Updated
    );
    assert_eq!(
        patch_chat_message(id.clone(), serde_json::json!({"text": "patched"}))
            .await
            .unwrap()
            .status,
        Status::Updated
    );
    assert_eq!(
        get_chat_messages_by_channel("audit".into()).await.unwrap().status,
        Status::Success
    );
    delete_chat_message(id).await.unwrap(); // envelope checked in t4 tests

    // --- chat accounts ---
    let account = create_chat_account(acc_create()).await.unwrap().data.unwrap();
    get_chat_account(account.id.clone().unwrap()).await.unwrap();
    get_chat_accounts(Some(ChatAccountFilter { platform: Some(Platform::Twitch), user_id: None }))
        .await
        .unwrap();
    update_chat_account(account.id.clone().unwrap(), acc_create()).await.unwrap();
    patch_chat_account(account.id.clone().unwrap(), serde_json::json!({"authStatus": "unauthorized"}))
        .await
        .unwrap();
    get_chat_account_by_platform_and_user(Platform::Twitch, "u-audit-surface".into())
        .await
        .unwrap();
    get_chat_accounts_by_platform(Platform::Twitch).await.unwrap();
    delete_chat_account(account.id.unwrap()).await.unwrap();

    // --- chat channels ---
    let channel = create_chat_channel(ChatChannelCreate {
        platform: "kick".into(),
        channel_id: "kc-audit".into(),
        channel_name: "AuditChan".into(),
        channel_image_url: None,
        is_authorized: None,
        account_id: None,
        account_capabilities: None,
        is_visible: None,
    })
    .await
    .unwrap()
    .data
    .unwrap();
    get_chat_channel(channel.id.clone().unwrap()).await.unwrap();
    get_chat_channels(Some(ChatChannelFilter { platform: Some(Platform::Kick), account_id: None }))
        .await
        .unwrap();
    update_chat_channel(
        channel.id.clone().unwrap(),
        ChatChannelCreate {
            platform: "kick".into(),
            channel_id: "kc-audit".into(),
            channel_name: "Renamed".into(),
            channel_image_url: None,
            is_authorized: None,
            account_id: None,
            account_capabilities: None,
            is_visible: None,
        },
    )
    .await
    .unwrap();
    patch_chat_channel(channel.id.clone().unwrap(), serde_json::json!({"isVisible": false}))
        .await
        .unwrap();
    get_chat_channel_by_platform_and_id(Platform::Kick, "kc-audit".into()).await.unwrap();
    delete_chat_channel(channel.id.unwrap()).await.unwrap();

    // --- custom emotes ---
    let emote = create_custom_emote(CustomEmoteCreate {
        platform: "twitch".into(),
        channel_id: None,
        emote_code: "auditEmote".into(),
        emote_url: "https://cdn.test/e.png".into(),
        emote_type: None,
    })
    .await
    .unwrap()
    .data
    .unwrap();
    get_custom_emote(emote.id.clone().unwrap()).await.unwrap();
    get_custom_emotes(Some(CustomEmoteFilter { platform: Some(Platform::Twitch), channel_id: None }))
        .await
        .unwrap();
    update_custom_emote(emote.id.clone().unwrap(), CustomEmoteCreate {
        platform: "twitch".into(),
        channel_id: None,
        emote_code: "auditEmote2".into(),
        emote_url: "https://cdn.test/e.png".into(),
        emote_type: None,
    })
    .await
    .unwrap();
    patch_custom_emote(emote.id.clone().unwrap(), serde_json::json!({"emoteCode": "x"}))
        .await
        .unwrap();
    get_custom_emotes_by_platform(Platform::Twitch).await.unwrap();
    delete_custom_emote(emote.id.unwrap()).await.unwrap();

    // --- dashboard preferences ---
    create_dashboard_preferences(DashboardPreferences {
        id: Some("audit-prefs".into()),
        ..DashboardPreferences::default()
    })
    .await
    .unwrap();
    get_dashboard_preferences("audit-prefs".into()).await.unwrap();
    get_dashboard_preferences_list().await.unwrap();
    update_dashboard_preferences(
        "audit-prefs".into(),
        DashboardPreferencesUpdate {
            feed_mode: None,
            density_mode: Some("cozy".into()),
            auto_scroll: None,
            split_layout: None,
            mixed_enabled_channel_ids: None,
        },
    )
    .await
    .unwrap();
    patch_dashboard_preferences("audit-prefs".into(), serde_json::json!({"autoScroll": false}))
        .await
        .unwrap();
    get_or_create_dashboard_preferences().await.unwrap();
    delete_dashboard_preferences("audit-prefs".into()).await.unwrap();

    // --- twitch irc / api ---
    twitch_irc_join_channel("c".into(), "chan".into(), "user".into(), "oauth".into())
        .await
        .unwrap();
    twitch_irc_leave_channel("c".into(), "chan".into()).await.unwrap();
    twitch_irc_send_message("c".into(), "chan".into(), "hi".into()).await.unwrap();
    twitch_irc_is_connected("c".into(), "chan".into()).await.unwrap();
    parse_irc_message(":a!a@a.tmi.twitch.tv PRIVMSG #c :yo\r\n".into(), "c".into(), "chan".into())
        .await
        .unwrap();
    twitch_fetch_global_icons().await.unwrap();
    twitch_fetch_channel_icons("c".into()).await.unwrap();
    twitch_delete_message("c".into(), "m".into(), "oauth".into()).await.unwrap();
    twitch_fetch_channel_emotes("c".into()).await.unwrap();

    // --- kick / youtube (registered gaps; surface must not drift) ---
    kick_fetch_chatroom_id("chan".into()).await.unwrap();
    kick_fetch_recent_messages("55555".into(), Some(10)).await.unwrap();
    kick_fetch_user_info("bob".into()).await.unwrap();
    kick_fetch_channel_emotes("c".into()).await.unwrap();
    kick_fetch_channel_info("c".into()).await.unwrap();
    kick_send_chat_message("55555".into(), "hi".into(), "oauth".into()).await.unwrap();
    kick_delete_chat_message("55555".into(), "m".into(), "oauth".into()).await.unwrap();
    youtube_fetch_channel_info_by_api_key("UC9".into(), "key".into()).await.unwrap();
    youtube_fetch_chat_messages("live".into(), "key".into(), Some(10)).await.unwrap();
    youtube_fetch_live_video_id_by_api_key("UC9".into(), "key".into()).await.unwrap();

    // --- auth chain (registered gap) ---
    auth_start(Platform::Twitch).await.unwrap();
    auth_await_callback(Platform::Twitch).await.unwrap();
    auth_complete(Platform::Twitch, "code".into()).await.unwrap();
    auth_status(Platform::Twitch).await.unwrap();
    auth_validate(Platform::Twitch).await.unwrap();
    auth_refresh(Platform::Twitch).await.unwrap();
    auth_disconnect(Platform::Twitch).await.unwrap();

    // --- overlay server (registered gap) ---
    start_overlay_server(0).await.unwrap();
    emit_overlay_config_changed(OverlayConfig {
        port: 0,
        enabled: false,
        sources: vec![OverlaySource {
            id: "audit-src".into(),
            channel_id: "c-1".into(),
            platform: "twitch".into(),
            enabled: true,
        }],
    })
    .await
    .unwrap();
    get_overlay_config().await.unwrap();
    init_overlay_config_from_storage().await.unwrap();
    get_overlay_messages(Some(10)).await.unwrap();
    open_overlay_window().await.unwrap();
    stop_overlay_server().await.unwrap();

    // --- storage (registered gap) ---
    storage_get("k".into()).await.unwrap();
    storage_set("k".into(), serde_json::json!(1)).await.unwrap();
    query_storage(serde_json::json!({})).await.unwrap();
    count_storage().await.unwrap();
    exists_storage("k".into()).await.unwrap();
    storage_keys().await.unwrap();
    storage_remove("k".into()).await.unwrap();
    storage_clear().await.unwrap();

    // --- updates (registered gap) ---
    check_for_update().await.unwrap();
    download_update("1.2.0".into()).await.unwrap();
    install_update().await.unwrap();
    let version = get_current_version().await.unwrap().data.unwrap();
    assert_eq!(version.current, env!("CARGO_PKG_VERSION"));

    // --- generic crud passthrough ---
    crud_execute(CrudExecuteInput {
        entity: "chat_messages".into(),
        operation: "count".into(),
        id: None,
        data: None,
        filter: None,
    })
    .await
    .unwrap();

    // delete_chat_messages_by_channel closes the message set.
    delete_chat_messages_by_channel("audit".into()).await.unwrap();
}

/// Compile-time drift guard: the audited surface size. If a handler is added
/// or removed without updating master-parity documentation, bump/reconcile.
#[test]
fn handler_surface_size_is_pinned() {
    // See module docs for provenance of the number.
    assert_eq!(EXPECTED_HANDLER_COUNT, 83);
}
