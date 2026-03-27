use regex::Regex;

/// Sanitize chat text specifically for overlay rendering.
///
/// Requirements (P0):
/// - Escape HTML special characters so the text is always treated as plain text.
/// - Strip URLs (minimal safety) and cap length to keep overlay readable.
pub fn sanitizeForOverlay(text: &str) -> String {
  const MAX_LEN: usize = 260;

  let escaped = escape_html(text);
  let without_links = strip_urls(&escaped);
  let trimmed = without_links.trim();
  cap_string(trimmed, MAX_LEN)
}

fn escape_html(input: &str) -> String {
  let mut out = String::with_capacity(input.len());
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

fn strip_urls(escaped_html: &str) -> String {
  // Note: we run after escaping, so "http://" parts are safe as plain text already.
  // This is intentionally minimal, not a full URL parser.
  // - Removes `http://...` and `https://...`
  // - Removes `www....` prefixed tokens
  let re = Regex::new(r"(https?://[^\s]+)|(www\.[^\s]+)").unwrap();
  re.replace_all(escaped_html, "").to_string()
}

fn cap_string(s: &str, max_len: usize) -> String {
  if s.len() <= max_len {
    s.to_string()
  } else {
    // char boundary safety: use chars and stop at max_len bytes would be incorrect.
    // For overlay, `len()` is good enough here because we mainly operate on ASCII-ish content.
    s.chars().take(max_len).collect()
  }
}
