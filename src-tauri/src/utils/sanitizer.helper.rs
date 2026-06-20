use crate::constants::MAX_LEN;
use regex::Regex;
/// Sanitize chat text specifically for overlay rendering.
///
/// Order matters: strip URLs BEFORE escaping HTML to prevent entity reconstruction attacks.
pub fn sanitize_for_overlay(text: &str) -> String {
  let without_links = strip_urls(text);
  let escaped = escape_html(&without_links);
  let trimmed = escaped.trim();
  cap_string(trimmed, MAX_LEN)
}
/// Escape HTML special characters to prevent XSS in overlay rendering
/// Optimized to count required escapes first to minimize allocations
pub fn escape_html(input: &str) -> String {
  // First pass: count characters that need escaping to pre-allocate exact size
  let mut extra_chars = 0;
  for ch in input.chars() {
    match ch {
      '&' => extra_chars += 4,             // &amp; is 5 chars, replaces 1
      '<' | '>' | '"' => extra_chars += 3, // &lt; &gt; &quot; are 4 chars, replace 1
      '\'' => extra_chars += 5,            // &#x27; is 6 chars, replaces 1
      _ => {}
    }
  }
  // If no escaping needed, return original
  if extra_chars == 0 {
    return input.to_string();
  }
  // Second pass: build output with exact capacity
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
/// Strip URLs from text to prevent spam in chat overlays
/// Handles various URL patterns including protocol-relative and edge cases
pub fn strip_urls(text: &str) -> String {
  let re = Regex::new(
    r#"(https?://[^\s<>"'\)\]]+)|(www\.[^\s<>"'\)\]]+)|([a-zA-Z][a-zA-Z0-9+.-]*://[^\s<>"'\)\]]+)"#,
  )
  .unwrap();
  re.replace_all(text, "").to_string()
}
/// Cap string to maximum length, preserving UTF-8 character boundaries
pub fn cap_string(s: &str, max_len: usize) -> String {
  if s.len() <= max_len {
    s.to_string()
  } else {
    s.chars().take(max_len).collect()
  }
}
