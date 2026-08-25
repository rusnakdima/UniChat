//! T5. Overlay message-shaping parity (`docs/parity/test-plan.md` §T5).
//!
//! Covers the pure shaping rules ported from master's overlay server:
//! sanitizer order (strip URLs BEFORE HTML escape, trim, 260-char cap),
//! ChatMessage→OverlayMessage shaping, channel-ref filtering with
//! newest-first sort + default limit of 50, and the subscriber broadcast
//! gates (supporter filter / channel allow-list).
//!
//! The HTTP/WS server itself (TCP accept, WS snapshot/push fan-out,
//! stop/restart) is a registered MISSING gap (parity report row 9) and runs
//! as ignored gap tests below.

use unichat_webapp::domain::entities::{ChatMessage, OverlayMessage};
use unichat_webapp::domain::overlay::{
    build_channel_ref, filter_and_sort_messages, sanitize_for_overlay, shape_overlay_message,
    should_broadcast, DEFAULT_MESSAGE_LIMIT, OVERLAY_MAX_LEN,
};

fn chat_message(text: &str) -> ChatMessage {
    ChatMessage {
        id: Some("m-1".into()),
        platform: "twitch".into(),
        source_message_id: "sm-1".into(),
        source_channel_id: "c-1".into(),
        source_user_id: "u-1".into(),
        author: "alice".into(),
        text: text.into(),
        ..ChatMessage::default()
    }
}

fn overlay(id: &str, platform: &str, channel: &str, ts: i64) -> OverlayMessage {
    OverlayMessage {
        id: id.into(),
        platform: platform.into(),
        channel_id: channel.into(),
        author: "a".into(),
        text: "hi".into(),
        timestamp: ts,
        color: "#FFFFFF".into(),
    }
}

/// Sanitizer: URLs stripped before escaping (master's documented order),
/// then trim, then cap at MAX_LEN=260 chars.
#[test]
fn sanitizer_rules_match_master() {
    assert_eq!(sanitize_for_overlay("see https://evil.example/x now"), "see  now");
    assert_eq!(sanitize_for_overlay("bare www.spam.example link"), "bare  link");
    assert_eq!(
        sanitize_for_overlay("<script>alert(\"x\")</script>"),
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    // Entity-reconstruction payloads riding on a URL vanish entirely,
    // because stripping happens before any escaping.
    assert_eq!(sanitize_for_overlay("https://e.example/a&lt;b"), "");

    let long = "é".repeat(400);
    let capped = sanitize_for_overlay(&long);
    assert_eq!(capped.chars().count(), OVERLAY_MAX_LEN);
    // UTF-8 boundary preserved.
    assert!(std::str::from_utf8(capped.as_bytes()).is_ok());

    // Whitespace trimmed.
    assert_eq!(sanitize_for_overlay("  hi  "), "hi");
}

/// Shaping: renderable messages map onto the overlay DTO with sanitized
/// text; deleted or non-renderable messages are dropped.
#[test]
fn shapes_chat_message_into_overlay_message() {
    let shaped = shape_overlay_message(&chat_message("hello <b>world</b>")).expect("shaped");
    assert_eq!(shaped.id, "m-1");
    assert_eq!(shaped.platform, "twitch");
    assert_eq!(shaped.channel_id, "c-1");
    assert_eq!(shaped.author, "alice");
    assert_eq!(shaped.text, "hello &lt;b&gt;world&lt;/b&gt;");

    // Non-renderable messages never reach the overlay.
    let mut gated = chat_message("nope");
    gated.can_render_in_overlay = false;
    assert!(shape_overlay_message(&gated).is_none());

    let mut deleted = chat_message("deleted");
    deleted.is_deleted = true;
    assert!(shape_overlay_message(&deleted).is_none());
}

/// Filter/sort: channel-ref filtering ("platform:channelId"), newest-first
/// ordering, explicit limit truncation.
#[test]
fn filter_and_sort_matches_master_helpers() {
    let messages = vec![
        overlay("old", "twitch", "c-1", 100),
        overlay("new", "twitch", "c-1", 300),
        overlay("mid", "kick", "c-2", 200),
    ];

    // No filter → everything, newest first.
    let sorted = filter_and_sort_messages(&messages, None, None);
    assert_eq!(
        sorted.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        vec!["new", "mid", "old"]
    );

    // Channel refs keep only matching platform:channel pairs.
    let filtered = filter_and_sort_messages(
        &messages,
        Some(&vec![build_channel_ref("twitch", "c-1")]),
        None,
    );
    assert_eq!(
        filtered.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        vec!["new", "old"]
    );

    // Explicit limit truncates after sorting.
    let limited = filter_and_sort_messages(&messages, None, Some(2));
    assert_eq!(
        limited.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
        vec!["new", "mid"]
    );
}

/// Default limit is master's DEFAULT_MESSAGE_LIMIT (50).
#[test]
fn default_limit_is_fifty() {
    let flood: Vec<OverlayMessage> = (0..60)
        .map(|i| overlay(&format!("m{i}"), "twitch", "c-1", i))
        .collect();
    let kept = filter_and_sort_messages(&flood, None, None);
    assert_eq!(kept.len(), DEFAULT_MESSAGE_LIMIT);
    assert_eq!(DEFAULT_MESSAGE_LIMIT, 50);
    // Newest kept, oldest truncated.
    assert_eq!(kept[0].id, "m59");
}

/// Subscriber broadcast gates: supporters-only widgets and channel
/// allow-lists (master's should_broadcast_to_subscriber).
#[test]
fn broadcast_gates_match_master() {
    let msg = overlay("x", "twitch", "c-9", 1);

    // All-filter, no channel list → everyone gets it.
    assert!(should_broadcast(false, None, &msg, false));

    // Supporters-only widget drops non-supporters, passes supporters.
    assert!(!should_broadcast(true, None, &msg, false));
    assert!(should_broadcast(true, None, &msg, true));

    // Channel allow-list matches on platform:channelId only.
    let ids = vec![build_channel_ref("twitch", "c-1")];
    assert!(!should_broadcast(false, Some(&ids), &msg, false));
    let target = overlay("y", "twitch", "c-1", 1);
    assert!(should_broadcast(false, Some(&ids), &target, false));
}

// ---------------------------------------------------------------------------
// Registered gap tests (MISSING overlay server — parity report row 9).
// ---------------------------------------------------------------------------

#[ignore = "gap: no overlay HTTP server exists in the port to accept TCP (T5.1)"]
#[tokio::test]
async fn t5_1_start_serves_static_assets() {
    unimplemented!("requires HTTP server")
}

#[ignore = "gap: no WS endpoint for config snapshots/pushes (T5.2)"]
#[tokio::test]
async fn t5_2_ws_config_snapshot_then_push() {
    unimplemented!("requires WS server")
}

#[ignore = "gap: source-entry validation lives in the unported WS handler (T5.3)"]
#[tokio::test]
async fn t5_3_malformed_source_skipped_valid_still_broadcast() {
    unimplemented!("requires WS server")
}

#[ignore = "gap: start/stop lifecycle not implemented (T5.4)"]
#[tokio::test]
async fn t5_4_stop_frees_port_restart_works() {
    unimplemented!("requires server lifecycle")
}
