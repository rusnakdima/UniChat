use regex::Regex;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::chat_message_model::ChatMessageModel;

// Lazy regex compilation
static URL_REGEX: once_cell::sync::Lazy<Regex> = once_cell::sync::Lazy::new(|| {
  Regex::new(r"(https?://[^\s]+)|(www\.[^\s]+)").unwrap()
});

static WORD_REGEX: once_cell::sync::Lazy<Regex> = once_cell::sync::Lazy::new(|| {
  Regex::new(r"(?i)\b\w+\b").unwrap()
});

/// MessageFilterService - Safety filters for chat messages
///
/// This service provides canonical sanitization and filtering:
/// 1. Blocked words filtering
/// 2. URL/link stripping
/// 3. HTML escaping for overlay safety
/// 4. Message length capping
///
/// All platform connectors should pass messages through this service
/// before routing to ensure consistent safety across all sources.
pub struct MessageFilterService {
  /// Set of blocked words (case-insensitive)
  blocked_words: Arc<RwLock<HashSet<String>>>,
  
  /// Whether to strip URLs from messages
  strip_urls_enabled: Arc<RwLock<bool>>,
  
  /// Maximum message length (0 = unlimited)
  max_length: Arc<RwLock<usize>>,
}

impl MessageFilterService {
  /// Create a new MessageFilterService with default settings
  pub fn new() -> Self {
    Self {
      blocked_words: Arc::new(RwLock::new(HashSet::new())),
      strip_urls_enabled: Arc::new(RwLock::new(true)),
      max_length: Arc::new(RwLock::new(260)),
    }
  }

  /// Create with custom settings
  pub fn with_config(blocked_words: HashSet<String>, strip_urls: bool, max_len: usize) -> Self {
    Self {
      blocked_words: Arc::new(RwLock::new(blocked_words)),
      strip_urls_enabled: Arc::new(RwLock::new(strip_urls)),
      max_length: Arc::new(RwLock::new(max_len)),
    }
  }

  /// Apply all filters to a message text
  ///
  /// This is the canonical sanitization path - all messages should flow through here.
  /// 
  /// # Arguments
  /// * `text` - Raw message text from platform
  /// 
  /// # Returns
  /// Filtered and sanitized text safe for overlay display
  pub async fn sanitize_message(&self, text: &str) -> String {
    let mut result = text.to_string();
    
    // 1. Apply blocked words
    result = self.apply_blocked_words(&result).await;
    
    // 2. Strip URLs if enabled
    let should_strip_urls = *self.strip_urls_enabled.read().await;
    if should_strip_urls {
      result = strip_urls(&result);
    }
    
    // 3. Escape HTML for safety
    result = escape_html(&result);
    
    // 4. Cap length
    let max_len = *self.max_length.read().await;
    result = cap_string(&result, max_len);
    
    result
  }

  /// Apply blocked words filter to text
  ///
  /// # Arguments
  /// * `text` - Message text to filter
  /// 
  /// # Returns
  /// Text with blocked words replaced with asterisks
  pub async fn apply_blocked_words(&self, text: &str) -> String {
    let blocked = self.blocked_words.read().await;
    let mut result = text.to_string();
    
    for word in blocked.iter() {
      if contains_word(&result, word) {
        result = replace_word(&result, word, "*");
      }
    }
    
    result
  }

  /// Strip URLs from text
  ///
  /// # Arguments
  /// * `text` - Message text
  /// 
  /// # Returns
  /// Text with URLs removed
  pub fn strip_urls_from_message(&self, text: &str) -> String {
    strip_urls(text)
  }

  /// Check if a message contains blocked words
  pub async fn contains_blocked_words(&self, text: &str) -> bool {
    let blocked = self.blocked_words.read().await;
    blocked.iter().any(|word| contains_word(text, word))
  }

  /// Add a word to the blocked list
  pub async fn add_blocked_word(&self, word: String) {
    let mut blocked = self.blocked_words.write().await;
    blocked.insert(word.to_lowercase());
  }

  /// Add multiple words to the blocked list
  pub async fn add_blocked_words(&self, words: Vec<String>) {
    let mut blocked = self.blocked_words.write().await;
    for word in words {
      blocked.insert(word.to_lowercase());
    }
  }

  /// Remove a word from the blocked list
  pub async fn remove_blocked_word(&self, word: &str) {
    let mut blocked = self.blocked_words.write().await;
    blocked.remove(&word.to_lowercase());
  }

  /// Clear all blocked words
  pub async fn clear_blocked_words(&self) {
    let mut blocked = self.blocked_words.write().await;
    blocked.clear();
  }

  /// Get all blocked words
  pub async fn get_blocked_words(&self) -> HashSet<String> {
    self.blocked_words.read().await.clone()
  }

  /// Enable or disable URL stripping
  pub async fn set_strip_urls_enabled(&self, enabled: bool) {
    let mut strip = self.strip_urls_enabled.write().await;
    *strip = enabled;
  }

  /// Check if URL stripping is enabled
  pub async fn is_strip_urls_enabled(&self) -> bool {
    *self.strip_urls_enabled.read().await
  }

  /// Set maximum message length
  pub async fn set_max_length(&self, length: usize) {
    let mut max = self.max_length.write().await;
    *max = length;
  }

  /// Get current maximum message length
  pub async fn get_max_length(&self) -> usize {
    *self.max_length.read().await
  }

  /// Sanitize a ChatMessageModel in place
  ///
  /// # Arguments
  /// * `message` - Message to sanitize
  /// 
  /// # Returns
  /// New message with sanitized text
  pub async fn sanitize_chat_message(&self, message: &ChatMessageModel) -> ChatMessageModel {
    let mut sanitized = message.clone();
    sanitized.text = self.sanitize_message(&message.text).await;
    sanitized
  }
}

impl Default for MessageFilterService {
  fn default() -> Self {
    Self::new()
  }
}

// --- Helper Functions (from message_sanitizer_helper.rs) ---

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

fn strip_urls(text: &str) -> String {
  URL_REGEX.replace_all(text, "").to_string()
}

fn cap_string(s: &str, max_len: usize) -> String {
  if s.len() <= max_len {
    s.to_string()
  } else {
    s.chars().take(max_len).collect()
  }
}

/// Check if text contains a word (case-insensitive, word boundary aware)
fn contains_word(text: &str, word: &str) -> bool {
  let word_lower = word.to_lowercase();
  WORD_REGEX.is_match(text) && {
    WORD_REGEX.find_iter(text).any(|m: regex::Match| {
      m.as_str().to_lowercase() == word_lower
    })
  }
}

/// Replace all occurrences of a word with replacement (case-insensitive)
fn replace_word(text: &str, word: &str, replacement: &str) -> String {
  let word_lower = word.to_lowercase();
  let replacement_stars: String = std::iter::repeat('*').take(word.len()).collect();
  
  WORD_REGEX.replace_all(text, |caps: &regex::Captures| {
    let matched = caps.get(0).unwrap().as_str();
    if matched.to_lowercase() == word_lower {
      replacement_stars.clone()
    } else {
      matched.to_string()
    }
  }).to_string()
}
