# UniChat Development Roadmap

## Project Overview

UniChat is a Tauri-based desktop chat aggregator for streamers, supporting Twitch, Kick, YouTube, and more. Built with Angular (frontend) and Rust (backend).

**Current Version:** 0.1.0
**Last Updated:** March 28, 2026

---

## 🎯 Strategic Goals

### High Priority

1. **Performance Optimization**
   - [ ] Reduce memory footprint for high-traffic chat sessions (1000+ msg/min)
   - [ ] Profile and reduce Rust backend CPU usage

2. **Stability & Reliability**
   - [ ] Graceful degradation when platforms are unavailable

3. **Code Quality**
   - [ ] Increase test coverage (target: 70%+)
     - Current: ~35% (Rust: 44 tests, Frontend: 3 test files)

### Medium Priority

4. **Feature Enhancements**
   - [ ] Custom emote support across platforms
   - [ ] Chat replay for VOD creation
   - [ ] Multi-account management

5. **User Experience**
   - [ ] Configurable keyboard shortcuts
   - [ ] Notification system for highlights

6. **Platform Support**
   - [ ] Mobile companion app (Android/iOS)
   - [ ] Linux AppImage and Flatpak distribution
   - [ ] Windows MSIX installer
   - [ ] macOS notarization for App Store

---

## 📋 Optimization Plan - Remaining Tasks

### Backend (Rust/Tauri)

#### Large Files to Split (P2)
- [ ] Split `icons.route.rs` (283 lines) - Split: 7TV logic, Twitch logic, helpers
- [ ] Split `youtube.route.rs` (287 lines) - Split: request structs, command handlers

#### Frontend Large Services (P2)
- [ ] Extract emote/badge fetching from `twitch-chat.service.ts` (1166 lines)
- [ ] Extract emote parsing from `kick-chat.service.ts` (500+ lines)

#### Future Architecture (P3)
- [ ] Implement plugin architecture for new platforms (v0.2.0)
- [ ] Add gRPC support for inter-process communication - ⚠️ **Deferred** (not needed for desktop)

### Build & CI/CD

#### Next Steps (v0.2.0)
- [ ] Set up automated release pipeline
- [ ] Implement semantic versioning
- [ ] Add changelog generation
- [ ] Create automated performance regression tests

---

## 🗺️ Version Milestones

### v0.1.0 (Current) - Foundation & Stability

**In Progress:**
- [ ] Mobile companion app
- [ ] Performance dashboard
- [ ] Linux AppImage and Flatpak distribution
- [ ] Windows MSIX installer
- [ ] macOS notarization

**Planned (v0.2.0):**
- [ ] Plugin system for extensibility
- [ ] Cloud sync for settings (optional)
- [ ] AI-powered chat filtering (optional)
- [ ] State management centralization (Signals/NgRx)
- [ ] Web Workers for message parsing (for 1000+ msg/min scenarios)
- [ ] IndexedDB for chat history caching

---

## 🔧 Technical Debt

### Known Issues - In Progress
1. **Memory usage** - Target: <100MB idle, <250MB load (Currently: ~150MB idle, ~400MB load)
2. **Message latency** - Target: <20ms (Currently: ~50ms)
3. **CPU usage** - Target: <1% idle (Currently: ~2%)
4. **Cold start time** - Target: <1s (Currently: ~2s)

### Refactoring Candidates - Pending
1. **Component structure** - Break down large components (>500 lines)
   - `twitch-chat.service.ts`: 1166 lines
   - `chat-message-card.component.ts`: 260+ lines
2. **State management** - Centralize with NgRx or Signals (v0.2.0)
3. **Helper function extraction** - Split large route files (icons.route.rs, youtube.route.rs)

---

## 📊 Metrics & KPIs

### Performance Targets
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Cold start time | ~2s | <1s | ⚠️ In Progress - LazyServiceLoader implemented |
| Memory usage (idle) | ~150MB | <100MB | ⚠️ In Progress - MemoryOptimizationService added |
| Memory usage (load) | ~400MB | <250MB | ⚠️ In Progress - Message batching, ring buffers |
| Message latency | ~50ms | <20ms | ⚠️ In Progress - MessageBatchingService for high-throughput |
| CPU usage (idle) | ~2% | <1% | ⚠️ In Progress - Optimized polling intervals |
| Bundle size | 1.27MB | <3MB | ✅ Achieved |

### Performance Optimizations Implemented (v0.1.0)
- ✅ **PerformanceMonitorService** - Track and monitor all performance metrics
- ✅ **MessageBatchingService** - Batch messages for 1000+ msg/min scenarios
- ✅ **MemoryOptimizationService** - Configurable pruning, ring buffers, compact message storage
- ✅ **LazyServiceLoader** - Lazy load non-critical services
- ✅ **Web Workers** - Offload message parsing to background thread
- ✅ **IndexedDB** - Chat history caching with automatic cleanup
- ✅ **Memoization** - LRU cache for expensive computations

### Quality Targets
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Test coverage | ~35% | 70%+ | ⚠️ In Progress |
| Linter violations | 0 | 0 | ✅ Achieved |
| TypeScript strict mode | Full | Full | ✅ Achieved |
| Documentation coverage | ~70% | 80%+ | ⚠️ In Progress |
| Clippy warnings | 0 | 0 | ✅ Achieved |
| Duplicated code | 0 | 0 | ✅ Achieved |
| Dead code | 0 | 0 | ✅ Achieved |
| Large files (>250 lines) | 6 | 0 | ⚠️ Needs Splitting |

---

## 🤝 Contribution Guidelines

### Getting Started
1. Read [README.md](README.md) for setup instructions
2. Check [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines
3. Review existing issues and PRs
4. Join community discussions

### Code Standards
- **TypeScript**: Strict mode, ESLint rules ✅
- **Rust**: Clippy warnings as errors, rustfmt ✅
- **Commits**: Conventional Commits specification ✅
- **PRs**: Include tests, update documentation

### Available Scripts
```bash
# Frontend
npm run build:frontend:check  # Type-check build
npm run format                # Format TypeScript/HTML/CSS
npm run format:check          # Check formatting

# Rust
npm run lint:rust             # Run clippy (warnings as errors)
npm run lint:rust:fix         # Auto-fix clippy warnings
npm run format:rust           # Format Rust code

# Combined
npm run format:all            # Format all code
npm run lint:all              # Check all linting
```

---

## 📝 March 2026 Optimization Session - COMPLETED

**24 tasks completed** - All code quality issues resolved.

### Summary
- ✅ Duplicate code: 7 → 0 instances
- ✅ Dead code: 6 → 0 instances  
- ✅ Lock acquisitions: 3 → 1 (67% reduction)
- ✅ Clippy warnings: 2 → 0
- ✅ Integration tests: 0 → 44 tests
- ✅ Bundle size: ~5MB → 1.27MB (75% reduction)
- ✅ Web Workers: Added for message parsing
- ✅ IndexedDB: Added for chat history
- ✅ CI/CD: GitHub Actions workflow

### Files Created
- 12 Rust backend modules
- 4 Angular frontend modules
- 1 GitHub Actions workflow

---

*This roadmap is a living document and will be updated quarterly based on community feedback and project priorities.*
