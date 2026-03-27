# YouTube Live Chat Integration - Limitations & Notes

**Last Updated:** 2026-03-27

## Overview

UniChat supports YouTube Live chat reading and sending through the YouTube Data API v3. This document outlines the current capabilities and limitations.

---

## Current Capabilities

### ✅ Supported Features

| Feature | Status | Notes |
|---------|--------|-------|
| Read live chat messages | ✅ Working | Via `liveChatMessages.list` API |
| Send chat messages | ✅ Working | Requires OAuth with `youtube.force-ssl` scope |
| Delete own messages | ✅ Working | Requires OAuth with `youtube.force-ssl` scope |
| Author badges (members) | ✅ Working | Detected via `isChatSponsor` flag |
| Author profile images | ✅ Working | Via `profileImageUrl` from API |
| Super Chat detection | ⚠️ Partial | Visible in message text but not specially styled |
| Membership messages | ⚠️ Partial | Shown as system messages |

---

## Limitations

### 🔴 API Quotas

The YouTube Data API v3 has strict quota limits:

| Operation | Quota Cost | Limit |
|-----------|------------|-------|
| `liveChatMessages.list` | 5 units | 10,000 units/day default |
| `liveChatMessages.insert` | 50 units | 10,000 units/day default |
| `liveChatMessages.delete` | 50 units | 10,000 units/day default |

**Impact:** With default quotas:
- ~2,000 message reads per day (polling every 2 seconds)
- ~200 messages sent per day maximum
- Quota resets at midnight PST

**Workaround:** Request quota increase from Google Cloud Console for production use.

### 🔴 No Historical Chat Access

**Limitation:** YouTube does NOT provide access to historical live chat messages after the stream ends.

- The `liveChatMessages.list` endpoint only works for **active** live streams
- No equivalent to Twitch's Robotty integration exists for YouTube
- Chat replay data is only available via YouTube's internal APIs (not public)

**Workaround:** 
- Store messages locally during the stream session
- Export chat logs manually if needed for VOD correlation

### 🔴 Polling-Based Architecture

**Limitation:** YouTube uses polling instead of WebSocket for live chat.

- Must poll every 2-5 seconds (per `pollingIntervalMillis` from API)
- Higher latency than WebSocket-based platforms (Twitch, Kick)
- More API calls = faster quota depletion

**Current Implementation:**
```typescript
// Polling interval from API (typically 2000-5000ms)
const waitMillis = Number(response.pollingIntervalMillis ?? 2000);
await this.delay(Math.max(500, waitMillis), signal);
```

### 🔴 Channel ID Resolution

**Limitation:** Converting channel handles (@username) to channel IDs requires additional API calls.

- `youtubeGetLiveVideoId` Tauri command handles this internally
- Uses InnerTube API (unofficial) for handle resolution
- May break if YouTube changes their internal API

**Supported Formats:**
- `@channelhandle` - Resolved via InnerTube
- `UCxxxxxxxxxxxxxxxxxx` - Direct channel ID
- `v:videoId` or `videoId` - Direct video ID for live streams

### 🔴 Emote Support

**Limitation:** YouTube emotes are NOT fully supported.

- Custom channel emotes not rendered (URLs not provided in API)
- Default YouTube emotes appear as text only
- No emote picker for sending messages

**Current Status:** Placeholder implementation in `EmoteUrlService`

---

## Authentication Requirements

### Reading Chat (Watch-Only)

**No authentication required** - Uses InnerTube API (unofficial YouTube API)

### Sending Messages

**Required OAuth Scopes:**
- `https://www.googleapis.com/auth/youtube.force-ssl`

**Setup:**
1. Connect YouTube account in Settings
2. Grant requested scopes during OAuth flow
3. Token stored securely in token vault

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `quotaExceeded` | Daily API quota exhausted | Wait for reset or request quota increase |
| `liveChatDisabled` | Chat disabled for stream | Cannot read/send; stream may be VOD |
| `invalidVideoId` | Video not found or not live | Check video ID; stream may have ended |
| `authRequired` | OAuth token missing/expired | Reconnect YouTube account |

### Error Display

Errors are surfaced via the connection error banner system:
- Network errors show retry option
- Auth errors require account reconnection
- Quota errors are logged but don't block UI

---

## Recommendations for Production

1. **Request Quota Increase**
   - Apply at Google Cloud Console
   - Justify with expected daily active users
   - Typical approved quota: 1,000,000 units/day

2. **Implement Local Caching**
   - Cache channel ID resolutions
   - Store recent messages locally
   - Reduce redundant API calls

3. **Add Quota Monitoring**
   - Track daily quota usage
   - Warn users when approaching limits
   - Implement graceful degradation

4. **Consider Hybrid Approach**
   - Use InnerTube for reading (no quota)
   - Use official API only for sending/deleting
   - Document ToS implications

---

## Future Improvements

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| Super Chat styling | Medium | Low | Detect via `type` field |
| Custom emote support | Low | High | Requires scraping/mirroring |
| Chat replay for VODs | Low | Medium | Would need custom solution |
| Quota dashboard | Medium | Low | Show usage in settings |

---

## References

- [YouTube Live Chat API Docs](https://developers.google.com/youtube/v3/live/docs/liveChatMessages)
- [API Quota Calculator](https://developers.google.com/youtube/v3/getting-started#quota)
- [InnerTube Documentation](https://invidious.io/) (unofficial)
