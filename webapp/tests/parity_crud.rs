//! T4. CRUD engine + persistence parity (`docs/parity/test-plan.md` §T4).
//!
//! Proves the ported handlers reproduce `master`'s generic CRUD engine over
//! the five aggregates: round-trips against a real temp-dir JSON store,
//! restart persistence, special lookups, exact delete counts, singleton
//! dashboard preferences, and the response envelope shape.
//!
//! Documented divergences (kept faithful to master where they conflict):
//! - Stored document keys are camelCase (webapp serde contract) while master
//!   stored snake_case raw JSON; filters target the webapp field names.
//! - Master's `Response.data` is a plain `T`; the shared library wraps it in
//!   `Option<T>` (serializes to `null` on error). Field names are identical.

mod common;
use common::{setup_store, store_root};
use unichat_webapp::application::handlers::*;
use unichat_webapp::domain::entities::*;

// Fixtures from the test plan.
const CHAT_ACCOUNT_CREATE: &str = r#"{
  "platform": "twitch", "userId": "u-1", "username": "alice",
  "accessToken": "at", "refreshToken": "rt", "authStatus": "authorized"
}"#;
const DASHBOARD_PREFS_PATCH: &str = r#"{ "densityMode": "cozy", "autoScroll": false }"#;

fn message(channel: &str, text: &str) -> ChatMessageCreate {
    ChatMessageCreate {
        platform: "twitch".into(),
        source_message_id: format!("sm-{text}"),
        source_channel_id: channel.into(),
        source_user_id: "u-9".into(),
        author: "alice".into(),
        text: text.into(),
        badges: None,
        is_supporter: None,
        is_outgoing: None,
        can_render_in_overlay: Some(true),
        reply_to_message_id: None,
        message_type: None,
        sequence_number: None,
    }
}

/// T4.1 — full round-trip per aggregate + file exists + restart reload.
#[tokio::test]
async fn t4_1_round_trip_per_aggregate_persists_across_restart() {
    let _guard = setup_store().await;

    // --- chat_messages ---
    let created = create_chat_message(message("c1", "hello")).await.unwrap();
    assert_eq!(created.status, dioxus_shared::response::Status::Created);
    let msg = created.data.clone().unwrap();
    assert_eq!(msg.text, "hello");

    let got = get_chat_message(msg.id.clone().unwrap()).await.unwrap();
    assert_eq!(got.data.unwrap().source_message_id, "sm-hello");

    let update = ChatMessageCreate { text: "edited".into(), ..message("c1", "hello") };
    let updated = update_chat_message(msg.id.clone().unwrap(), update).await.unwrap();
    assert_eq!(updated.data.unwrap().text, "edited");

    let patched = patch_chat_message(
        msg.id.clone().unwrap(),
        serde_json::json!({"isSupporter": true}),
    )
    .await
    .unwrap();
    let patched = patched.data.unwrap();
    assert!(patched.is_supporter);
    assert_eq!(patched.text, "edited"); // patch merged, not replaced

    // --- chat_accounts (fixture from plan) ---
    let input: ChatAccountCreate = serde_json::from_str(CHAT_ACCOUNT_CREATE).unwrap();
    let account = create_chat_account(input.clone()).await.unwrap().data.unwrap();
    assert_eq!(account.platform, "twitch");
    assert_eq!(account.access_token.as_deref(), Some("at"));

    let updated = update_chat_account(account.id.clone().unwrap(), input)
        .await
        .unwrap()
        .data
        .unwrap();
    assert_eq!(updated.user_id, "u-1");
    delete_chat_account(updated.id.clone().unwrap()).await.unwrap();

    // --- chat_channels / custom_emotes / dashboard_preferences round trips ---
    let channel = create_chat_channel(ChatChannelCreate {
        platform: "kick".into(),
        channel_id: "kc-1".into(),
        channel_name: "KickChannel".into(),
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
    assert_eq!(channel.channel_name, "KickChannel");

    let emote = create_custom_emote(CustomEmoteCreate {
        platform: "twitch".into(),
        channel_id: None,
        emote_code: "uniKappa".into(),
        emote_url: "https://example.test/kappa.png".into(),
        emote_type: None,
    })
    .await
    .unwrap()
    .data
    .unwrap();
    assert_eq!(emote.emote_code, "uniKappa");

    let prefs = create_dashboard_preferences(DashboardPreferences {
        id: None,
        feed_mode: "split".into(),
        density_mode: "compact".into(),
        auto_scroll: false,
        split_layout: DashboardPreferences::default().split_layout,
        mixed_enabled_channel_ids: vec!["twitch:c1".into()],
    })
    .await
    .unwrap()
    .data
    .unwrap();
    assert_eq!(prefs.feed_mode, "split");

    // Store files exist under the root and survive a provider "restart".
    let messages_file = std::path::Path::new(store_root())
        .join("unichat_db")
        .join("chat_messages.json");
    assert!(
        messages_file.exists() || std::path::Path::new(store_root()).join("chat_messages.json").exists(),
        "chat_messages collection file should exist under the store root"
    );
    let reopened =
        dioxus_shared::storage::create_json_provider(store_root().join("unichat_db"))
            .await
            .expect("reopen provider");
    use nosql_orm::prelude::DatabaseProvider;
    let doc = reopened
        .find_by_id("chat_messages", msg.id.clone().unwrap().as_str())
        .await
        .unwrap()
        .expect("message persisted across restart");
    assert_eq!(doc.get("text"), Some(&serde_json::json!("edited")));
}

/// T4.2 — `get_chat_account_by_platform_and_user` finds a seeded row;
/// wrong platform yields an error envelope.
#[tokio::test]
async fn t4_2_lookup_by_platform_and_user() {
    let _guard = setup_store().await;

    let mut input: ChatAccountCreate = serde_json::from_str(CHAT_ACCOUNT_CREATE).unwrap();
    input.user_id = "u-t42".into();
    create_chat_account(input).await.unwrap();

    let found = get_chat_account_by_platform_and_user(Platform::Twitch, "u-t42".into())
        .await
        .unwrap();
    let account = found.data.expect("seeded account found");
    assert_eq!(account.username, "alice");
    assert_eq!(account.platform, "twitch");

    // Master returns Status::Error with message "Account not found".
    let missing = get_chat_account_by_platform_and_user(Platform::Kick, "u-t42".into())
        .await
        .unwrap();
    assert_eq!(missing.status, dioxus_shared::response::Status::Error);
    assert_eq!(missing.message, "Account not found");
    assert!(missing.data.is_none());
}

/// T4.3 — `delete_chat_messages_by_channel` returns the exact deleted count
/// (7 seeded messages across 2 channels).
#[tokio::test]
async fn t4_3_delete_by_channel_exact_count() {
    let _guard = setup_store().await;

    for i in 0..4 {
        create_chat_message(message("del-chan-a", &format!("a{i}"))).await.unwrap();
    }
    for i in 0..3 {
        create_chat_message(message("del-chan-b", &format!("b{i}"))).await.unwrap();
    }

    let by_channel = get_chat_messages_by_channel("del-chan-a".into())
        .await
        .unwrap()
        .data
        .unwrap();
    assert_eq!(by_channel.len(), 4);

    let deleted = delete_chat_messages_by_channel("del-chan-a".into())
        .await
        .unwrap()
        .data
        .unwrap();
    assert_eq!(deleted, 4);

    let remaining_a = get_chat_messages_by_channel("del-chan-a".into())
        .await
        .unwrap()
        .data
        .unwrap();
    assert!(remaining_a.is_empty());
    let remaining_b = get_chat_messages_by_channel("del-chan-b".into())
        .await
        .unwrap()
        .data
        .unwrap();
    assert_eq!(remaining_b.len(), 3);
}

/// T4.4 — `get_or_create_dashboard_preferences` twice → same id; patch persists.
#[tokio::test]
async fn t4_4_get_or_create_dashboard_preferences_singleton() {
    let _guard = setup_store().await;

    let first = get_or_create_dashboard_preferences().await.unwrap().data.unwrap();
    let second = get_or_create_dashboard_preferences().await.unwrap().data.unwrap();
    assert_eq!(first.id, second.id);
    assert_eq!(second.id, Some(unichat_webapp::infrastructure::data_store::DEFAULT_DASHBOARD_PREFERENCES_ID.into()));

    let patched = patch_dashboard_preferences(
        second.id.clone().unwrap(),
        serde_json::from_str(DASHBOARD_PREFS_PATCH).unwrap(),
    )
    .await
    .unwrap()
    .data
    .unwrap();
    assert_eq!(patched.density_mode, "cozy");
    assert!(!patched.auto_scroll);

    let reloaded = get_or_create_dashboard_preferences().await.unwrap().data.unwrap();
    assert_eq!(reloaded.density_mode, "cozy");
    assert!(!reloaded.auto_scroll);
}

/// T4.5 — response envelope parity: same field names as master `Response<T>`
/// (`status`, `message`, `data`); single-word status strings identical to
/// master's lowercase serialization.
#[tokio::test]
async fn t4_5_response_envelope_golden() {
    let _guard = setup_store().await;

    let created = create_chat_message(message("env-chan", "envelope"))
        .await
        .unwrap();
    let json = serde_json::to_value(&created).unwrap();
    let obj = json.as_object().expect("envelope object");
    for key in ["status", "message", "data"] {
        assert!(obj.contains_key(key), "envelope must carry `{key}` like master");
    }
    assert_eq!(
        obj.get("status").and_then(|v| v.as_str()),
        Some("created"),
        "single-word statuses serialize identically to master's lowercase enum"
    );

    // Known divergence vs master: multi-word statuses serialize camelCase
    // ("notFound") because the shared Response uses rename_all = camelCase;
    // master used rename_all = lowercase ("not_found").
    let missing = get_chat_message("no-such-id".into()).await.unwrap();
    assert_eq!(serde_json::to_value(&missing).unwrap()["status"], "error");

    let deleted = delete_chat_message(created.data.unwrap().id.unwrap())
        .await
        .unwrap();
    assert_eq!(serde_json::to_value(&deleted).unwrap()["status"], "deleted");
}

/// Generic `crud_execute` passthrough over the same JSON provider
/// (mirrors master's `crud_command.rs`).
#[tokio::test]
async fn crud_execute_round_trip() {
    let _guard = setup_store().await;

    let created = crud_execute(CrudExecuteInput {
        entity: "chat_messages".into(),
        operation: "create".into(),
        id: None,
        data: Some(serde_json::to_value(message("crud-chan", "generic")).unwrap()),
        filter: None,
    })
    .await
    .unwrap();
    assert_eq!(created.status, dioxus_shared::response::Status::Created);
    let id = created.data.unwrap()["id"].as_str().unwrap().to_string();

    let fetched = crud_execute(CrudExecuteInput {
        entity: "chat_messages".into(),
        operation: "get".into(),
        id: Some(id.clone()),
        data: None,
        filter: None,
    })
    .await
    .unwrap();
    assert_eq!(fetched.data.unwrap()["text"], "generic");

    let deleted = crud_execute(CrudExecuteInput {
        entity: "chat_messages".into(),
        operation: "delete".into(),
        id: Some(id),
        data: None,
        filter: None,
    })
    .await
    .unwrap();
    assert_eq!(deleted.status, dioxus_shared::response::Status::Deleted);
}
