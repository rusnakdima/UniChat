//! Overlay helper functions module
//! Shared logic for overlay message filtering, sorting, and processing
use crate::models::overlay_message_model::OverlayMessageModel;
/// Filter and sort overlay messages by channel IDs, timestamp, and limit.
///
/// - Filters by `channel_ids` if provided and non-empty
/// - Sorts by timestamp (newest first)
/// - Applies `limit` if provided
pub fn filter_and_sort_messages(
  messages: &[OverlayMessageModel],
  channel_ids: Option<&Vec<String>>,
  limit: Option<u32>,
) -> Vec<OverlayMessageModel> {
  let mut result = messages.to_vec();
  if let Some(ids) = channel_ids {
    if !ids.is_empty() {
      result.retain(|msg| {
        let channel_ref = format!("{}:{}", msg.platform, msg.source_channel_id);
        ids.contains(&channel_ref)
      });
    }
  }
  result.sort_by(|a, b| {
    let a_time = a.timestamp.parse::<i64>().unwrap_or(0);
    let b_time = b.timestamp.parse::<i64>().unwrap_or(0);
    b_time.cmp(&a_time)
  });
  let limit_value = limit.unwrap_or(crate::constants::DEFAULT_MESSAGE_LIMIT as u32) as usize;
  if result.len() > limit_value {
    result.truncate(limit_value);
  }
  result
}
