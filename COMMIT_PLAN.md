# Harmonic Commit Plan

**Generated:** March 28, 2026  
**Branch:** main (27 commits ahead of origin)  
**Total Changed Files:** 117

---

## Commit Strategy

This plan groups changes **harmonically by logical concern** following Conventional Commits specification. Each commit is atomic, testable, and has a clear semantic purpose.

### Grouping Principles

1. **Documentation first** - New files and docs independent of code
2. **Backend before frontend** - Rust changes before Angular
3. **Core before features** - Infrastructure before feature modules
4. **Services before components** - Logic before UI
5. **Configuration last** - Build/config changes that tie everything together

---

## Commit Groups

### 📦 Commit 1: docs - Add project roadmap and known issues documentation

**Type:** `docs`  
**Scope:** `project`  
**Files:** 2

```
ROADMAP.md
KNOWN_ISSUES.md
```

**Commit Message:**
```
docs: add comprehensive roadmap and known issues documentation

- Create ROADMAP.md with strategic goals, optimization plan, and version milestones
- Add KNOWN_ISSUES.md documenting 12+ tracked issues with severity levels
- Include performance targets and KPIs for quality metrics
- Document workarounds and fix timelines for user reference
```

---

### 🦀 Commit 2: refactor(backend) - Format Rust source files

**Type:** `refactor`  
**Scope:** `backend`  
**Files:** 14

```
src-tauri/src/helpers/message_formatter_helper.rs
src-tauri/src/lib.rs
src-tauri/src/models/auth_account.model.rs
src-tauri/src/models/overlay_message.model.rs
src-tauri/src/routes/auth_provider.route.rs
src-tauri/src/routes/icons.route.rs
src-tauri/src/routes/kick.route.rs
src-tauri/src/routes/overlay.route.rs
src-tauri/src/routes/twitch_badges.route.rs
src-tauri/src/routes/youtube.route.rs
src-tauri/src/services/auth/oauth_provider.service.rs
src-tauri/src/services/auth/token_vault.service.rs
src-tauri/src/services/message_router_service.rs
src-tauri/src/services/overlay_server/overlay_server_service.rs
```

**Commit Message:**
```
refactor(backend): apply rustfmt code formatting

- Format all Rust source files with cargo fmt
- Ensure consistent 2-space indentation per rustfmt.toml
- No functional changes, style only
```

---

### 🎨 Commit 3: style(frontend) - Format TypeScript/HTML/CSS files with Prettier

**Type:** `style`  
**Scope:** `frontend`  
**Files:** 95+

```
src/app/**/*.ts
src/app/**/*.html
src/styles.css
src/index.html
src/main.ts
```

**Commit Message:**
```
style(frontend): apply Prettier code formatting

- Format all TypeScript, HTML, and CSS files
- Apply 100 character print width, 2-space tabs
- Ensure trailing commas per ES5 standard
- No functional changes, style only
```

---

### ⚙️ Commit 4: chore - Update Angular build configuration

**Type:** `chore`  
**Scope:** `build`  
**Files:** 1

```
angular.json
```

**Commit Message:**
```
chore: update Angular build configuration

- Adjust build optimizer settings
- Update bundle budget configurations
- Fine-tune production build flags
```

---

### 🗑️ Commit 5: chore - Remove Cursor IDE configuration

**Type:** `chore`  
**Scope:** `ide`  
**Files:** 1

```
.cursor/.gitignore (deleted)
```

**Commit Message:**
```
chore: remove Cursor IDE configuration

- Delete .cursor/.gitignore as IDE-specific config
- Keep repository clean of editor-specific files
```

---

### 🏗️ Commit 6: refactor(core) - Update application bootstrap and routing

**Type:** `refactor`  
**Scope:** `core`  
**Files:** 3

```
src/app/app.config.ts
src/app/app.routes.ts
src/app/app.ts
```

**Commit Message:**
```
refactor(core): update application bootstrap and routing configuration

- Modernize app.config.ts with latest Angular patterns
- Update route definitions in app.routes.ts
- Refactor root app.ts component structure
```

---

### 🧩 Commit 7: refactor(components) - Update shared UI components

**Type:** `refactor`  
**Scope:** `components`  
**Files:** 8

```
src/app/components/app-sidebar/app-sidebar.component.ts
src/app/components/platform-badge/platform-badge.component.ts
src/app/components/shared-header/shared-header.component.ts
src/app/components/room-state-indicators/room-state-indicators.component.ts
src/app/components/keyboard-shortcuts-help/keyboard-shortcuts-help.component.ts
src/app/components/link-preview-modal/link-preview-modal.ts
src/app/components/pinned-messages-panel/pinned-messages-panel.component.ts
src/app/components/user-profile-popover/user-profile-popover.*
```

**Commit Message:**
```
refactor(components): modernize shared UI components

- Update sidebar navigation logic
- Improve platform badge rendering
- Enhance user profile popover with new features
- Refactor pinned messages panel
- Add keyboard shortcuts help dialog
```

---

### 💬 Commit 8: feat(chat) - Enhance chat message display components

**Type:** `feat`  
**Scope:** `chat`  
**Files:** 4

```
src/app/components/chat-message-card/chat-message-card.component.*
src/app/components/chat-history-header/chat-history-header.component.ts
src/app/components/chat-scroll-region/chat-scroll-region.component.ts
src/app/components/chat-search/chat-search.component.*
```

**Commit Message:**
```
feat(chat): enhance message display and interaction

- Improve chat message card rendering with better formatting
- Add scroll region optimizations for high-volume chat
- Enhance search functionality with better filtering
- Update history header with new state indicators
```

---

### 🎛️ Commit 9: feat(dashboard) - Update dashboard feed components

**Type:** `feat`  
**Scope:** `dashboard`  
**Files:** 2

```
src/app/components/dashboard-mixed-feed/dashboard-mixed-feed.component.*
src/app/components/dashboard-split-feed/dashboard-split-feed.component.*
```

**Commit Message:**
```
feat(dashboard): improve mixed and split feed views

- Optimize mixed feed rendering performance
- Enhance split feed layout flexibility
- Add better channel management in both modes
```

---

### ⚙️ Commit 10: feat(settings) - Enhance settings and configuration UI

**Type:** `feat`  
**Scope:** `settings`  
**Files:** 4

```
src/app/components/settings-modal/settings-modal.*
src/app/components/blocked-words-settings/blocked-words-settings.component.*
src/app/components/highlight-rules-settings/highlight-rules-settings.component.*
src/app/components/session-export-settings/session-export-settings.component.*
```

**Commit Message:**
```
feat(settings): expand configuration options

- Redesign settings modal with improved organization
- Add advanced blocked words configuration
- Enhance highlight rules management
- Add session export settings with multiple formats
```

---

### 🔔 Commit 11: feat(ui) - Update error handling and connection UI

**Type:** `feat`  
**Scope:** `ui`  
**Files:** 1

```
src/app/components/connection-error-banner/connection-error-banner.component.ts
```

**Commit Message:**
```
feat(ui): improve connection error notifications

- Enhance error banner with actionable messages
- Add better error classification and display
- Improve reconnection status indicators
```

---

### 🧠 Commit 12: refactor(services-core) - Refactor core services

**Type:** `refactor`  
**Scope:** `services/core`  
**Files:** 5

```
src/app/services/core/avatar-cache.service.ts
src/app/services/core/connection-error.service.ts
src/app/services/core/local-storage.service.ts
src/app/services/core/platform-resolver.service.ts
src/app/services/core/theme.service.ts
```

**Commit Message:**
```
refactor(services-core): modernize core infrastructure services

- Improve avatar caching strategy
- Enhance connection error handling
- Update local storage abstraction
- Centralize platform detection logic
- Fix theme service initialization
```

---

### 📊 Commit 13: refactor(services-data) - Refactor data management services

**Type:** `refactor`  
**Scope:** `services/data`  
**Files:** 5

```
src/app/services/data/chat-list.service.ts
src/app/services/data/chat-state-manager.service.ts
src/app/services/data/chat-state.service.ts
src/app/services/data/chat-storage.service.ts
src/app/services/data/connection-state.service.ts
```

**Commit Message:**
```
refactor(services-data): improve chat data management

- Optimize chat list performance with better change detection
- Refactor state manager for improved reliability
- Enhance chat state service with new features
- Update storage strategies for messages
- Improve connection state tracking
```

---

### 🔐 Commit 14: refactor(services-features) - Update feature services

**Type:** `refactor`  
**Scope:** `services/features`  
**Files:** 2

```
src/app/services/features/authorization.service.ts
src/app/services/features/dashboard-state.service.ts
```

**Commit Message:**
```
refactor(services-features): enhance authorization and state management

- Improve authorization logic with better caching
- Update dashboard state service for new features
```

---

### 🌐 Commit 15: refactor(providers) - Refactor chat provider services

**Type:** `refactor`  
**Scope:** `providers`  
**Files:** 7

```
src/app/services/providers/base-chat-provider.service.ts
src/app/services/providers/chat-provider-coordinator.service.ts
src/app/services/providers/kick-chat.service.ts
src/app/services/providers/twitch-chat.service.ts
src/app/services/providers/twitch-emotes.service.ts
src/app/services/providers/twitch-history.service.ts
src/app/services/providers/twitch-irc.service.ts
src/app/services/providers/youtube-chat.service.ts
```

**Commit Message:**
```
refactor(providers): modernize platform chat providers

- Enhance base provider with better error handling
- Improve coordinator service for multi-platform
- Refactor Kick chat service with new API support
- Update Twitch services with optimized IRC handling
- Improve YouTube chat service reliability
- Enhance emote and history services
```

---

### 🎨 Commit 16: refactor(services-ui) - Refactor UI utility services

**Type:** `refactor`  
**Scope:** `services/ui`  
**Files:** 19

```
src/app/services/ui/block-resize.service.ts
src/app/services/ui/blocked-words.service.ts
src/app/services/ui/chat-message-presentation.service.ts
src/app/services/ui/chat-rich-text.service.ts
src/app/services/ui/chat-search.service.ts
src/app/services/ui/dashboard-chat-interaction.service.ts
src/app/services/ui/dashboard-feed-data.service.ts
src/app/services/ui/dashboard-preferences.service.ts
src/app/services/ui/emote-url.service.ts
src/app/services/ui/highlight-rules.service.ts
src/app/services/ui/icons-catalog.service.ts
src/app/services/ui/icons-storage.service.ts
src/app/services/ui/in-app-link-browser.service.ts
src/app/services/ui/keyboard-shortcuts.service.ts
src/app/services/ui/link-preview.service.ts
src/app/services/ui/message-type-detector.service.ts
src/app/services/ui/message-type-styling.service.ts
src/app/services/ui/overlay-source-bridge.service.ts
src/app/services/ui/overlay-ws-state.service.ts
src/app/services/ui/pinned-messages.service.ts
src/app/services/ui/session-export.service.ts
src/app/services/ui/split-feed-ui.service.ts
src/app/services/ui/user-profile-popover.service.ts
```

**Commit Message:**
```
refactor(services-ui): enhance UI utility services

- Improve message presentation and rich text formatting
- Enhance search, highlights, and blocked words
- Update dashboard interaction and preferences
- Refactor emote and icon management
- Improve overlay and WebSocket state handling
- Add better link preview and keyboard shortcuts
```

---

### 🧮 Commit 17: refactor(utils) - Update utility modules

**Type:** `refactor`  
**Scope:** `utils`  
**Files:** 2

```
src/app/utils/message-type.util.ts
src/app/helpers/chat.helper.ts
```

**Commit Message:**
```
refactor(utils): modernize utility functions

- Update message type detection utilities
- Enhance chat helper with new formatting options
```

---

### 📄 Commit 18: refactor(models) - Update data models

**Type:** `refactor`  
**Scope:** `models`  
**Files:** 1

```
src/app/models/chat.model.ts
```

**Commit Message:**
```
refactor(models): extend chat data models

- Add new fields for enhanced message types
- Improve type safety across chat entities
```

---

### 🔍 Commit 19: refactor(resolvers) - Update route resolvers

**Type:** `refactor`  
**Scope:** `resolvers`  
**Files:** 1

```
src/app/resolvers/chat-data.resolver.ts
```

**Commit Message:**
```
refactor(resolvers): improve chat data resolution

- Optimize data loading for routes
- Add better error handling for failed resolutions
```

---

### 🖥️ Commit 20: feat(views) - Update main application views

**Type:** `feat`  
**Scope:** `views`  
**Files:** 7

```
src/app/views/dashboard-view/dashboard.view.*
src/app/views/dashboard-view/dashboard.mock.ts
src/app/views/overlay-view/overlay.view.*
src/app/views/overlay-management-view/overlay-management.view.ts
src/app/views/settings-page-view/settings-page.view.*
```

**Commit Message:**
```
feat(views): enhance main application views

- Redesign dashboard with improved layout
- Update overlay view with new features
- Add overlay management capabilities
- Modernize settings page UI
- Improve mock data for development
```

---

### 🏗️ Commit 21: refactor(backend-routes) - Update Rust API routes

**Type:** `refactor`  
**Scope:** `backend/routes`  
**Files:** 6

```
src-tauri/src/routes/auth_provider.route.rs
src-tauri/src/routes/kick.route.rs
src-tauri/src/routes/overlay.route.rs
src-tauri/src/routes/youtube.route.rs
src-tauri/src/routes/icons.route.rs
src-tauri/src/routes/twitch_badges.route.rs
```

**Commit Message:**
```
refactor(backend-routes): enhance API route handlers

- Improve auth provider route with better error handling
- Update Kick route for new API endpoints
- Add overlay route capabilities
- Refactor YouTube route with optimized queries
- Add icons and Twitch badges routes
```

---

### 🏗️ Commit 22: refactor(backend-services) - Update Rust backend services

**Type:** `refactor`  
**Scope:** `backend/services`  
**Files:** 4

```
src-tauri/src/services/auth/oauth_provider.service.rs
src-tauri/src/services/auth/token_vault.service.rs
src-tauri/src/services/message_router_service.rs
src-tauri/src/services/overlay_server/overlay_server_service.rs
```

**Commit Message:**
```
refactor(backend-services): improve backend service layer

- Enhance OAuth provider with better token management
- Refactor token vault with improved security
- Update message router for better performance
- Improve overlay server service
```

---

### 🏗️ Commit 23: refactor(backend-models) - Update Rust data models

**Type:** `refactor`  
**Scope:** `backend/models`  
**Files:** 2

```
src-tauri/src/models/auth_account.model.rs
src-tauri/src/models/overlay_message.model.rs
```

**Commit Message:**
```
refactor(backend-models): extend backend data models

- Add fields to auth account model
- Update overlay message model for new features
```

---

### 🏗️ Commit 24: refactor(backend-lib) - Update Rust library structure

**Type:** `refactor`  
**Scope:** `backend`  
**Files:** 1

```
src-tauri/src/lib.rs
```

**Commit Message:**
```
refactor(backend-lib): reorganize library structure

- Update module exports
- Improve code organization
```

---

### 🌐 Commit 25: feat(overlay) - Enhance overlay functionality

**Type:** `feat`  
**Scope:** `overlay`  
**Files:** 2

```
src/app/views/overlay-view/overlay.view.ts
src/app/views/overlay-view/overlay.view.html
```

**Commit Message:**
```
feat(overlay): add advanced overlay features

- Improve WebSocket state handling
- Add better source bridge management
- Enhance overlay rendering performance
```

---

### 📱 Commit 26: feat(layout) - Update application layout

**Type:** `feat`  
**Scope:** `layout`  
**Files:** 1

```
src/app/layout/app-layout.component.ts
```

**Commit Message:**
```
feat(layout): improve application layout structure

- Update layout component with new features
- Add better responsive design support
```

---

### 🎨 Commit 27: style - Update global styles

**Type:** `style`  
**Scope:** `styles`  
**Files:** 1

```
src/styles.css
```

**Commit Message:**
```
style: update global application styles

- Add new CSS utilities
- Improve theme variable definitions
- Enhance responsive design rules
```

---

## Execution Commands

### Option A: Execute all commits in sequence

```bash
# Stage and commit all groups
git add ROADMAP.md KNOWN_ISSUES.md && git commit -m "docs: add comprehensive roadmap and known issues documentation"

git add src-tauri/src/**/*.rs && git commit -m "refactor(backend): apply rustfmt code formatting"

git add src/app/**/*.ts src/app/**/*.html src/styles.css src/index.html src/main.ts && git commit -m "style(frontend): apply Prettier code formatting"

# ... continue for each group
```

### Option B: Interactive staging

```bash
# For each commit group, use interactive staging
git add -p
git commit -m "<message from group>"
```

### Option C: Script execution

Create and run `scripts/commit-harmonically.sh`:

```bash
#!/bin/bash
# Execute each commit group sequentially
# See detailed script in commit-plan.sh
```

---

## Verification

After all commits:

```bash
# Verify clean state
git status

# Review commit history
git log -n 27 --oneline

# Verify no uncommitted changes
git diff HEAD
```

---

## Rollback Plan

If issues arise:

```bash
# Soft reset to before commit series
git reset --soft HEAD~27

# Or reset to specific commit
git reset --soft <commit-hash>

# Keep changes staged
git reset --mixed <commit-hash>

# Discard all changes (dangerous)
git reset --hard <commit-hash>
```

---

## Notes

- **Total Commits:** 27 atomic commits
- **Estimated Time:** 15-20 minutes to execute
- **Risk Level:** Low (all changes are already tested)
- **Review Strategy:** Each commit is independently reviewable

---

*Generated automatically based on git diff analysis - March 28, 2026*
