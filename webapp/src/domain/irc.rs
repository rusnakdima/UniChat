//! Twitch IRC message parsing.
//!
//! Pure port of `master`'s `parse_twitch_message`
//! (`src-tauri/src/services/twitch_irc.service.rs`). The parser is the
//! parity surface tested by `tests/parity_irc_parse.rs`; the websocket
//! transport around it on `master` is intentionally not ported here (the
//! Dioxus client is a registered gap).

use crate::domain::entities::{Badge, Emote, IrcMessage};

/// Extracts the leading `@...` tags segment of a raw IRC line, exactly like
/// master: find the first `@`, then cut at the next space.
fn tags_segment(raw: &str) -> Option<&str> {
    let at_pos = raw.find('@')?;
    let space_pos = raw[at_pos..].find(' ')?;
    Some(&raw[at_pos..at_pos + space_pos])
}

/// Parse a raw Twitch PRIVMSG line into an [`IrcMessage`].
///
/// Behavior preserved from `master`:
/// - only lines matching `:(nick)!(user)@(host).tmi.twitch.tv PRIVMSG #(chan) :(text)`
///   produce a message; everything else (PING/JOIN/…) yields `None`;
/// - tag parsing: `badges` (`set/version[/extra]` quirk kept), `color`
///   (default `#FFFFFF`, empty ignored), `user-id`, `emotes`
///   (`id:start-end` pairs → cdn url), `mod`, `subscriber`;
/// - timestamp is "now" (millis) and the id is
///   `twitch-{channel_id}-{user_id}-{timestamp}`.
pub fn parse_twitch_message(
    raw: &str,
    channel_id: &str,
    channel_name: &str,
) -> Option<IrcMessage> {
    let tags_str = tags_segment(raw);

    let privmsg = raw.split_once(" PRIVMSG #")?;
    let after_hash = privmsg.1;

    // Channel/text split mirrors the greedy `(.+) :(.+)` capture: the
    // channel extends to the LAST ` :` that still leaves non-empty text
    // (the `:` separator is 2 chars).
    let cut = after_hash
        .char_indices()
        .filter(|(i, _)| {
            after_hash[*i..].starts_with(" :") && after_hash[*i + 2..].len() >= 1
        })
        .map(|(i, _)| i)
        .next_back()?;
    let _channel = &after_hash[..cut]; // master also discards the parsed chan
    let text = after_hash[cut + 2..].trim_end_matches(['\r', '\n']);

    // Author/host: mirror `:(.+)!.+@.+\.tmi\.twitch\.tv` — the leftmost ':'
    // whose remainder is `nick!(user@)host.tmi.twitch.tv`.
    let prefix_all = privmsg.0;
    let mut author = None;
    for (i, _) in prefix_all.match_indices(':') {
        let seg = &prefix_all[i + 1..];
        if let Some(bang) = seg.find('!') {
            if let Some((_, host)) = seg[bang + 1..].split_once('@') {
                if host.ends_with(".tmi.twitch.tv") {
                    author = Some(seg[..bang].to_string());
                    break;
                }
            }
        }
    }
    let author = author?;
    let mut badges = Vec::new();
    let mut color = "#FFFFFF".to_string();
    let mut user_id = String::new();
    let mut emotes: Vec<Emote> = Vec::new();
    let mut is_mod = false;
    let mut is_subscriber = false;

    if let Some(tags) = tags_str {
        for tag in tags.trim_start_matches('@').split(';') {
            let Some((key, value)) = tag.split_once('=') else {
                continue;
            };
            match key {
                "badges" => {
                    for badge in value.split(',') {
                        let Some((set_id, tail)) = badge.split_once('/') else {
                            continue;
                        };
                        // Master quirk: id comes from the first segment after
                        // '/' and version from an optional second one.
                        let mut ver_parts = tail.splitn(2, '/');
                        let id = ver_parts.next().unwrap_or("").to_string();
                        let version = ver_parts.next().unwrap_or("").to_string();
                        badges.push(Badge { set_id: set_id.to_string(), id, version });
                    }
                }
                "color" => {
                    if !value.is_empty() {
                        color = value.to_string();
                    }
                }
                "user-id" => user_id = value.to_string(),
                "emotes" => {
                    for emote in value.split('/') {
                        let Some((id, code)) = emote.split_once(':') else {
                            continue;
                        };
                        emotes.push(Emote {
                            id: id.to_string(),
                            code: code.to_string(),
                            urls: vec![format!(
                                "https://static-cdn.jtvnw.net/emoticons/v2/{}/default/light/1.0",
                                id
                            )],
                        });
                    }
                }
                "mod" => is_mod = value == "1",
                "subscriber" => is_subscriber = value == "1",
                _ => {}
            }
        }
    }

    let timestamp = chrono::Utc::now().timestamp_millis();
    let id = format!("twitch-{}-{}-{}", channel_id, user_id, timestamp);

    Some(IrcMessage {
        id,
        platform: "twitch".to_string(),
        channel_id: channel_id.to_string(),
        channel_name: channel_name.to_string(),
        author: author.to_string(),
        author_id: user_id,
        text: text.to_string(),
        timestamp,
        badges,
        color,
        emotes,
        is_mod,
        is_subscriber,
        is_highlighted: false,
    })
}

/// Format an outgoing chat line exactly as master's send path does.
pub fn format_privmsg(channel_name: &str, message: &str) -> String {
    format!("PRIVMSG #{} :{}\r\n", channel_name.to_lowercase(), message)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LINE_PRIVMSG: &str =
        ":alice!alice@alice.tmi.twitch.tv PRIVMSG #channel :Kappa hello world\r\n";

    #[test]
    fn parses_plain_privmsg() {
        let msg = parse_twitch_message(LINE_PRIVMSG, "ch-1", "Channel").expect("parses");
        assert_eq!(msg.author, "alice");
        assert_eq!(msg.text, "Kappa hello world");
        assert_eq!(msg.channel_id, "ch-1");
        assert_eq!(msg.color, "#FFFFFF");
    }

    #[test]
    fn ignores_non_privmsg_lines() {
        assert!(parse_twitch_message("PING :tmi.twitch.tv\r\n", "c", "n").is_none());
        assert!(
            parse_twitch_message(
                ":unichat_bot!unichat_bot@unichat_bot.tmi.twitch.tv JOIN #channel\r\n",
                "c",
                "n"
            )
            .is_none()
        );
    }

    #[test]
    fn formats_privmsg_like_master() {
        assert_eq!(
            format_privmsg("Channel", "hi"),
            "PRIVMSG #channel :hi\r\n"
        );
    }
}
