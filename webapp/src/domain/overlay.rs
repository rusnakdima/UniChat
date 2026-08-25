//! Overlay message shaping.
//!
//! Pure ports of `master`'s overlay logic:
//! - `sanitize_for_overlay` (`src-tauri/src/utils/sanitizer.helper.rs`)
//! - `filter_and_sort_messages` (`overlay_server/overlay-helpers.service.rs`)
//! - channel-ref building / supporter filtering rules
//!   (`overlay_server/overlay-subscriber-manager.service.rs`)

use crate::domain::entities::{ChatMessage, OverlayMessage};

/// `master::constants::MAX_LEN`
pub const OVERLAY_MAX_LEN: usize = 260;
/// `master::constants::DEFAULT_MESSAGE_LIMIT`
pub const DEFAULT_MESSAGE_LIMIT: usize = 50;

/// Strip URLs from text (protocol-relative and scheme-relative forms included).
fn strip_urls(text: &str) -> String {
    let re = regex::Regex::new(
        r#"(https?://[^\s<>"'\)\]]+)|(www\.[^\s<>"'\)\]]+)|([a-zA-Z][a-zA-Z0-9+.-]*://[^\s<>"'\)\]]+)"#,
    )
    .expect("url regex");
    re.replace_all(text, "").to_string()
}

/// Escape HTML special characters (`&`, `<`, `>`, `"`, `'`), like master.
pub fn escape_html(input: &str) -> String {
    let mut extra_chars = 0usize;
    for ch in input.chars() {
        match ch {
            '&' => extra_chars += 4,
            '<' | '>' | '"' => extra_chars += 3,
            '\'' => extra_chars += 5,
            _ => {}
        }
    }
    if extra_chars == 0 {
        return input.to_string();
    }
    let mut out = String::with_capacity(input.len() + extra_chars);
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#x27;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Cap to `max_len` CHARACTERS, preserving UTF-8 boundaries, like master.
pub fn cap_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        s.chars().take(max_len).collect()
    }
}

/// Sanitize chat text for overlay rendering.
///
/// Master rule: strip URLs BEFORE escaping HTML so entity reconstruction
/// attacks fail, then trim, then cap at [`OVERLAY_MAX_LEN`] chars.
pub fn sanitize_for_overlay(text: &str) -> String {
    let without_links = strip_urls(text);
    let escaped = escape_html(&without_links);
    let trimmed = escaped.trim();
    cap_string(trimmed, OVERLAY_MAX_LEN)
}

/// Shape an ingested [`ChatMessage`] into an [`OverlayMessage`].
///
/// Messages flagged `can_render_in_overlay == false` are dropped (`None`),
/// matching the master gate where only renderable messages reach the overlay
/// pipeline. Text passes through [`sanitize_for_overlay`].
pub fn shape_overlay_message(message: &ChatMessage) -> Option<OverlayMessage> {
    if !message.can_render_in_overlay || message.is_deleted {
        return None;
    }
    Some(OverlayMessage {
        id: message
            .id
            .clone()
            .unwrap_or_else(|| message.source_message_id.clone()),
        platform: message.platform.clone(),
        channel_id: message.source_channel_id.clone(),
        author: message.author.clone(),
        text: sanitize_for_overlay(&message.text),
        timestamp: message.received_at.unwrap_or_else(|| chrono::Utc::now().timestamp_millis()),
        color: "#FFFFFF".to_string(),
    })
}

/// Build the `platform:channel_id` filter reference used on master.
pub fn build_channel_ref(platform: &str, source_channel_id: &str) -> String {
    format!("{platform}:{source_channel_id}")
}

/// Filter and sort overlay messages by channel refs and timestamp.
///
/// Master rules preserved:
/// - filters by `platform:channel_id` when `channel_refs` is non-empty;
/// - sorts newest first;
/// - truncates to `limit`, defaulting to [`DEFAULT_MESSAGE_LIMIT`].
pub fn filter_and_sort_messages(
    messages: &[OverlayMessage],
    channel_refs: Option<&Vec<String>>,
    limit: Option<u32>,
) -> Vec<OverlayMessage> {
    let mut result = messages.to_vec();
    if let Some(ids) = channel_refs {
        if !ids.is_empty() {
            result.retain(|msg| {
                let channel_ref = build_channel_ref(&msg.platform, &msg.channel_id);
                ids.contains(&channel_ref)
            });
        }
    }
    result.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    let limit_value = limit.unwrap_or(DEFAULT_MESSAGE_LIMIT as u32) as usize;
    if result.len() > limit_value {
        result.truncate(limit_value);
    }
    result
}

/// Subscriber-side broadcast gate ported from master's
/// `should_broadcast_to_subscriber`: supporters-only widgets drop non-supporter
/// messages, and a configured channel list restricts by `platform:channel_id`.
pub fn should_broadcast(
    supporters_only: bool,
    channel_ids: Option<&Vec<String>>,
    message: &OverlayMessage,
    is_supporter: bool,
) -> bool {
    if supporters_only && !is_supporter {
        return false;
    }
    match channel_ids {
        None => true,
        Some(ids) => ids.iter().any(|id| {
            *id == build_channel_ref(&message.platform, &message.channel_id)
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_urls_before_html() {
        assert_eq!(sanitize_for_overlay("see https://evil.example/x now"), "see  now");
        assert_eq!(
            sanitize_for_overlay("<script>alert(1)</script>"),
            "&lt;script&gt;alert(1)&lt;/script&gt;"
        );
    }

    #[test]
    fn caps_long_text_by_chars() {
        let long = "é".repeat(300);
        assert_eq!(sanitize_for_overlay(&long).chars().count(), OVERLAY_MAX_LEN);
    }
}
