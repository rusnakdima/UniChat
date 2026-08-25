//! T2. Twitch IRC pipeline parity — parsing surface
//! (`docs/parity/test-plan.md` §T2).
//!
//! The pure parser is the ported half of master's `twitch_irc.service.rs`.
//! The websocket transport around it (PING→PONG on the socket, connection
//! map idempotency, late-message drop) has no implementation in the Dioxus
//! port yet (`TwitchIrcClient` is a logging stub, parity report row 4), so
//! those plan items run as documented `#[ignore]` gap tests.

use unichat_webapp::application::handlers::parse_irc_message;

// Fixtures — canned raw IRC lines exactly as master's parser sees them.
pub const LINE_PING: &str = "PING :tmi.twitch.tv\r\n";
pub const LINE_JOIN: &str =
    ":unichat_bot!unichat_bot@unichat_bot.tmi.twitch.tv JOIN #channel\r\n";
pub const LINE_PRIVMSG: &str =
    ":alice!alice@alice.tmi.twitch.tv PRIVMSG #channel :Kappa hello world\r\n";
pub const LINE_TAGS: &str = concat!(
    "@badge-info=;badges=broadcaster/1;color=#FF0000;display-name=Alice;",
    "emotes=25:0-4;id=msg-42;mod=0;room-id=987;tmi-sent-ts=1700000000000;",
    "user-id=111;user-type= :alice!alice@alice.tmi.twitch.tv PRIVMSG #channel :Kappa \r\n"
);

/// T2.2 — plain PRIVMSG parses into an IrcMessage with author/text resolved.
#[test]
fn t2_2_parse_plain_privmsg() {
    let msg = unichat_webapp::domain::irc::parse_twitch_message(LINE_PRIVMSG, "ch-1", "Channel")
        .expect("PRIVMSG parses");
    assert_eq!(msg.author, "alice");
    assert_eq!(msg.text, "Kappa hello world");
    assert_eq!(msg.platform, "twitch");
    // Channel identity comes from the join context (channel_id/channel_name
    // arguments), matching master which also ignores the raw channel name.
    assert_eq!(msg.channel_id, "ch-1");
    assert_eq!(msg.channel_name, "Channel");
    // Untagged messages keep master's default color and flags.
    assert_eq!(msg.color, "#FFFFFF");
    assert!(!msg.is_mod);
    assert!(!msg.is_subscriber);
}

/// T2.3 — tagged PRIVMSG: emotes, badges, mod/sub flags and color.
///
/// DIVERGENCE NOTE (plan vs master): the plan expects `tmi-sent-ts` to map to
/// `timestamp`, but master's `parse_twitch_message` never reads that tag — it
/// stamps "now". The port stays faithful to master; the fixture value
/// 1700000000000 is asserted NOT to leak through.
#[test]
fn t2_3_parse_tagged_privmsg() {
    let msg =
        unichat_webapp::domain::irc::parse_twitch_message(LINE_TAGS, "987", "channel")
            .expect("tagged PRIVMSG parses");

    // Emote positions 25:0-4 produce one Emote with id "25" (master stores
    // the position range in `code`).
    assert_eq!(msg.emotes.len(), 1);
    assert_eq!(msg.emotes[0].id, "25");
    assert_eq!(msg.emotes[0].code, "0-4");
    assert_eq!(
        msg.emotes[0].urls,
        vec!["https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/1.0"]
    );

    // Badge list contains broadcaster/1 (master quirk: version lands in `id`).
    assert_eq!(msg.badges.len(), 1);
    assert_eq!(msg.badges[0].set_id, "broadcaster");
    assert_eq!(msg.badges[0].id, "1");

    assert_eq!(msg.color, "#FF0000");
    assert_eq!(msg.author_id, "111");
    assert!(!msg.is_mod); // mod=0
    assert_eq!(msg.channel_id, "987");

    // Master behavior: timestamp is receive time, not tmi-sent-ts.
    let now = chrono::Utc::now().timestamp_millis();
    assert!(
        (msg.timestamp - now).abs() < 5_000,
        "timestamp should be ~now, got {}",
        msg.timestamp
    );
    assert_ne!(msg.timestamp, 1_700_000_000_000);

    // Message id embeds channel, user and timestamp like master.
    assert!(msg.id.starts_with("twitch-987-111-"));
}

/// Non-PRIVMSG lines (PING, JOIN) parse to None at the parser level.
#[test]
fn t2_non_privmsg_lines_are_not_chat() {
    let parse = |raw| {
        unichat_webapp::domain::irc::parse_twitch_message(raw, "c", "n").is_none()
    };
    assert!(parse(LINE_PING));
    assert!(parse(LINE_JOIN));
}

/// T2.6 (pure half) — outgoing lines format exactly like master's send path:
/// lowercased channel, trailing CRLF.
#[test]
fn t2_6_send_path_formats_privmsg_line() {
    assert_eq!(
        unichat_webapp::domain::irc::format_privmsg("Channel", "hello world"),
        "PRIVMSG #channel :hello world\r\n"
    );
}

/// Handler surface: `parse_irc_message` wraps the parser in the standard
/// response envelope with Some(message) for chat lines and None otherwise.
#[tokio::test]
async fn handler_parse_irc_message_envelope() {
    let parsed = parse_irc_message(LINE_PRIVMSG.into(), "c-1".into(), "chan".into())
        .await
        .unwrap();
    let msg = parsed.data.expect("envelope carries data");
    assert_eq!(msg.expect("chat line yields Some").author, "alice");

    let none = parse_irc_message(LINE_PING.into(), "c-1".into(), "chan".into())
        .await
        .unwrap();
    assert!(
        matches!(none.data, Some(None)),
        "PING yields None inside the envelope"
    );
}

// ---------------------------------------------------------------------------
// Registered gap tests (MISSING transport — parity report row 4).
// These encode master's expected socket-level behavior for when the client
// lands; they are intentionally ignored, not deleted.
// ---------------------------------------------------------------------------

#[ignore = "gap: TwitchIrcClient is a stub — no socket to observe PONG on (T2.1)"]
#[tokio::test]
async fn t2_1_ping_gets_ponged_on_socket_within_100ms() {
    unimplemented!("requires real/mock IRC transport")
}

#[ignore = "gap: connection map lives in master's service; port has no join state (T2.4)"]
#[tokio::test]
async fn t2_4_double_join_is_idempotent() {
    unimplemented!("requires connection map")
}

#[ignore = "gap: leave_channel/remove-from-map not implemented in port (T2.5)"]
#[tokio::test]
async fn t2_5_leave_drops_connection_and_late_messages() {
    unimplemented!("requires connection map")
}
