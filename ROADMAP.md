# UniChat — Product Roadmap & Implementation Status

**Last Updated:** 2026-03-27

---

## Implementation Status Summary

### ✅ Completed Features (Current Sprint)

| Category | Completed Items |
|----------|----------------|
| **Core** | Unified message model, reply threads, collapsible platforms, per-channel layouts, density settings, timestamps |
| **Platforms** | Twitch (full), Kick (live), YouTube Live (API), reconnect backoff |
| **Auth** | OAuth flow, token storage (keyring), account switcher, **multi-account support** |
| **Rich Media** | 7TV/BTTV/FFZ emotes, Twitch badges, badge tooltips, emote rendering, Kick emotes |
| **Moderation** | Send messages (Twitch), delete permission checks, reply support |
| **Overlay** | Local WebSocket server, multiple widgets, custom CSS, filters (all/supporters), channel filtering |
| **Safety** | PII hygiene, token redaction, **blocked words & regex filtering**, **highlight rules** |
| **History** | Session buffer (4000 msgs/channel), pagination, Robotty integration |
| **Performance** | Message limiting, backpressure handling |
| **Settings** | Preferences persistence, settings page, blocked words management, highlight rules management |
| **Infrastructure** | AvatarCacheService, EmoteUrlService, App constants, Platform styles |
| **Error Handling** | **Connection error boundaries**, **error reporting service**, **per-provider error handling** |
| **State Management** | **Consolidated services** (ChatStorageService, ChatStateService, ChatStateManagerService, ConnectionStateService) |
| **Search** | **Full-text search**, author filtering, platform/channel filters, regex support |
| **Bookmarks** | **Pinned messages**, notes, export/import, dashboard panel |
| **Room State** | **Slow mode indicators**, followers-only, subscribers-only, emotes-only, R9K |

### ⚠️ Partial / In Progress

- **YouTube emotes**: URL service exists but placeholder implementation
- **Mod actions**: Delete implemented; timeout/ban not available
- **Super Chat styling**: Detected but not specially styled

### ❌ Not Started / Future

See individual sections below for tasks without ✅ markers.

---

## Core Chat Experience

| Task | Status | Notes |
|------|--------|-------|
| Unified model refinements | ✅ | Reply threads, message edits/deletes, timeouts/bans surfaced |
| **Search & jump** | ✅ | Full-text search, author filter, platform/channel filters |
| **Bookmarks / pins** | ✅ | Pin messages, add notes, export/import JSON |
| **Slow mode & followers-only indicators** | ✅ | Room state indicators in chat header |
| **Highlight rules** | ✅ | Regex/keyword highlights with custom colors |
| Collapsible platforms | ✅ | Hide platform in mixed view without disconnecting |
| Per-channel layouts | ✅ | Remember mixed/split and column widths |
| Font & density settings | ✅ (density) | Dyslexia-friendly font not implemented |
| Timestamps | ✅ | Local and source-relative options |
| Accessibility | ❌ | Screen-reader labels, keyboard navigation pending |

---

## Platforms & Connectivity

| Task | Status | Notes |
|------|--------|-------|
| YouTube Live | ✅ (API) | Chat reading/sending via API; see limitations doc |
| Trovo, DLive, Rumble, TikTok Live | ❌ | New ChatProvider implementations needed |
| Discord stage / voice-linked text | ❌ | Separate product scope |
| Reconnect backoff & health UI | ✅ | Visible degraded state, manual retry |
| **Error boundaries** | ✅ | Network errors with retry/dismiss |
| **Multi-account per platform** | ✅ | Multiple accounts, primary badge, account selection |
| Proxy / SOCKS support | ❌ | For restricted networks |
| Offline queue | ❌ | Opt-in outgoing message buffer |

---

## Authentication & Accounts

| Task | Status | Notes |
|------|--------|-------|
| Secure token storage | ✅ | Keyring integration per OS |
| Token refresh & expiry UX | ❌ | Prompts before streams, background refresh |
| Scope minimization | ❌ | Document and request only needed scopes |
| Account switcher | ✅ | Fast swap without full reconnect |

---

## Rich Media: Emotes, Badges, Mentions

| Task | Status | Notes |
|------|--------|-------|
| 7TV / BTTV / FFZ | ✅ | Unified emote catalog with cache |
| Kick emote mapping | ✅ | Same rendering pipeline as Twitch |
| YouTube emote mapping | ⚠️ | Placeholder implementation |
| Badge tooltips | ✅ | Hover for badge meaning and source |
| Emote picker | ❌ | For sending messages |
| Chatter list | ❌ | Side panel showing who is in chat |

---

## Sending Messages & Moderation

| Task | Status | Notes |
|------|--------|-------|
| Send path parity | ✅ (Twitch) | Rate limit UI, duplicate detection |
| Mod actions (delete) | ✅ | Delete with permission check |
| Mod actions (timeout/ban) | ❌ | API and auth dependent |
| Raid / host notifications | ❌ | As system messages |
| Whisper / DM | ❌ | Separate tab or modal |

---

## OBS Overlay & Streaming Tools

| Task | Status | Notes |
|------|--------|-------|
| Local overlay server | ✅ | Stable port, copy URL, QR code |
| Multiple overlay scenes | ✅ | Different URLs for different layouts |
| Custom CSS / themes | ✅ | Editor with presets, live preview |
| Widget filters | ✅ (partial) | Supporters-only done; keywords/badges pending |
| Transparent background | ✅ | Templates for 1080p, 1440p, vertical |
| Browser source troubleshooting | ❌ | WebSocket status, last message time |
| TTS | ❌ | Triggers, queue, voice selection |
| Alert hooks | ❌ | StreamElements/Streamlabs integration |

---

## Safety & Compliance

| Task | Status | Notes |
|------|--------|-------|
| **Blocked words & regex** | ✅ | Global and per-channel lists |
| Link policy | ❌ | Strip, allowlist, or warning mode |
| PII hygiene | ✅ | Avoid logging raw tokens |
| Child safety / ToS | ❌ | Document storage and third-party mirrors |

---

## History, Replay & Export

| Task | Status | Notes |
|------|--------|-------|
| Session export | ❌ | JSON/CSV for analytics or VOD correlation |
| Chat replay mode | ❌ | Timeline scrubber aligned with VOD |
| Long-term archive | ✅ (session) | 4000 msgs/channel; encrypted DB pending |

---

## Notifications & Desktop Integration

| Task | Status | Notes |
|------|--------|-------|
| System tray | ❌ | Unread counts, quick mute |
| Native notifications | ❌ | @mention, mod queue, keyword alerts |
| Global hotkey | ❌ | Push-to-talk for TTS or focus |
| Always on top toggle | ❌ | Remember per display |

---

## Performance & Reliability

| Task | Status | Notes |
|------|--------|-------|
| Virtual scroll | ❌ | Keep memory bounded in large buffers |
| Worker offload | ❌ | Parsing / rich text segmentation |
| Backpressure | ✅ | Drop/sample messages when FPS suffers |
| Rust-side fan-out | ❌ | Single normalize path before Angular |

---

## Mobile (Tauri Android / iOS)

| Task | Status | Notes |
|------|--------|-------|
| Read-only companion | ❌ | View chat on tablet next to PC |
| Adaptive layout | ❌ | Bottom sheet, reduced motion |
| Background limits | ❌ | Honest UX about OS killing WebSockets |

---

## Settings, Onboarding & Docs

| Task | Status | Notes |
|------|--------|-------|
| First-run wizard | ❌ | Connect platform, pick layout, test overlay |
| In-app help | ❌ | Platform-specific limitations |
| Diagnostics package | ✅ | Export redacted logs for support |

---

## Developer Experience & Quality

| Task | Status | Notes |
|------|--------|-------|
| E2E tests | ❌ | Playwright for Angular; Tauri smoke tests |
| Contract tests | ❌ | ChatMessage shape between Rust and frontend |
| Localization (i18n) | ❌ | Extract strings; community translations |
| Release channels | ❌ | Beta feed with auto-update |

---

## Experimental / Future

| Task | Priority | Notes |
|------|----------|-------|
| Plugin API | Low | WASM or script hooks (high risk; needs sandboxing) |
| AI assist | Low | Local-only chat summaries; opt-in |
| Collaborative modding | Low | Shared blocklists via signed export |

---

## Priority Queue

### High Priority (Completed)

| Task | Status |
|------|--------|
| ~~Error Boundaries~~ | ✅ **Completed** |
| ~~State Management Consolidation~~ | ✅ **Completed** |
| ~~TypeScript Strict Mode~~ | ✅ **Completed** (already enabled) |
| ~~Blocked Words UI~~ | ✅ **Completed** |
| ~~Highlight Rules UI~~ | ✅ **Completed** |
| ~~Search & Jump~~ | ✅ **Completed** |
| ~~Bookmarks/Pins~~ | ✅ **Completed** |
| ~~Room State Indicators~~ | ✅ **Completed** |
| ~~YouTube History Documentation~~ | ✅ **Completed** |
| ~~Multi-Account Support~~ | ✅ **Completed** |

### Medium Priority (Remaining)

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| TwitchChatService Refactor | Medium | High | Split into IRC, Emotes, History, UserInfo modules |
| PlatformResolverService | Medium | Medium | Centralize platform-specific logic |
| Storage Consistency | Medium | Low | Move all localStorage to preferences service |
| Accessibility Audit | Medium | Medium | Screen-reader labels, keyboard navigation |
| Keyboard Shortcuts | Medium | Low | Document and expand beyond Ctrl+K |

### Low Priority

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| Chat Replay | Low | High | Timeline scrubber for VOD correlation |
| Session Export | Low | Medium | JSON/CSV export functionality |
| Virtual Scroll | Low | High | For very large message buffers |
| E2E Tests | Low | High | Playwright setup |
| TTS Integration | Low | Medium | Triggers, queue, voice selection |

---

## Known Issues

### Performance
- **Bundle size**: 1.18 MB (exceeds 1.00 MB budget by 18%)
- **tmi.js CommonJS**: Causes optimization bailouts
- **Virtual scrolling**: Not implemented for large buffers

### Platform Limitations
- **YouTube emotes**: Placeholder implementation only
- **YouTube history**: No historical chat access (API limitation)
- **Mod actions**: Only delete implemented; timeout/ban pending

### UX Gaps
- **Keyboard shortcuts**: Only Ctrl+K documented
- **Accessibility**: Screen reader labels incomplete
- **Mobile support**: Not optimized for mobile/tablet

### Technical Debt
- **Storage consistency**: Mix of localStorage and preferences service
- **OAuth client_secret**: Optional for dev; needs production config
- **Error recovery**: Auto-reconnect exists but user control limited

---

## Optimization Plan

### Short Term (Next Sprint)
1. **Bundle Size Reduction**
   - Lazy load settings components
   - Tree-shake unused Material icons
   - Consider lighter tmi.js alternative

2. **Performance**
   - Implement virtual scrolling
   - Add trackBy to all ngFor loops
   - Optimize change detection

3. **Documentation**
   - API integration guide for new platforms
   - Troubleshooting guide for common issues

### Medium Term (1-2 Months)
1. **Architecture**
   - PlatformResolverService
   - Split TwitchChatService into modules
   - Storage consistency refactor

2. **Features**
   - Accessibility improvements
   - Keyboard shortcuts expansion
   - Widget keyword/badge filters

3. **Quality**
   - E2E tests with Playwright
   - Contract tests for ChatMessage
   - Accessibility audit

### Long Term (3+ Months)
1. **Platform Expansion**
   - Trovo, DLive, Rumble support
   - Full YouTube feature parity
   - Discord integration (if in scope)

2. **Advanced Features**
   - Chat replay with VOD sync
   - Session export (JSON/CSV)
   - TTS integration
   - Plugin API (with sandboxing)

3. **Mobile**
   - Tauri Android/iOS companion app
   - Read-only chat view for tablets
   - Adaptive layouts

---

## Sprint Summary (2026-03-27)

### Completed This Sprint

**18 commits, ~4,800 lines added, ~500 lines removed**

#### Phase 1: Foundation & Stability
- ✅ Error Boundaries (4 commits)
- ✅ State Management Consolidation (1 commit)

#### Phase 2: Safety & Moderation
- ✅ Blocked Words & Regex (1 commit)
- ✅ Highlight Rules (1 commit)

#### Phase 3: User Experience
- ✅ Search & Jump (1 commit)
- ✅ Bookmarks/Pins (1 commit)
- ✅ Room State Indicators (1 commit)

#### Phase 4: Platform & Documentation
- ✅ YouTube History Documentation (1 commit)
- ✅ Multi-Account Support UI (1 commit)

### Build Status

✅ **All builds pass successfully**
- Bundle size: 1.18 MB
- No TypeScript errors
- No Angular template errors
- 10 new services created
- 6 new components created

---

*This ROADMAP is a living document. Last comprehensive update: 2026-03-27*
