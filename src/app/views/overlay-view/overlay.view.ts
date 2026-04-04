/* sys lib */
import { NgStyle } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ChangeDetectorRef,
  OnDestroy,
  effect,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { invoke } from "@tauri-apps/api/core";

/* models */
import {
  DensityMode,
  PlatformType,
  WidgetConfig,
  WidgetFilter,
  OverlayAnimationType,
  OverlayDirection,
  ChatMessage,
} from "@models/chat.model";
import { YouTubeChannelInfo } from "@models/platform-api.model";

/* services */
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChatRichTextService, ChatTextSegment } from "@services/ui/chat-rich-text.service";
import { OverlayChatMessage, OverlayWsStateService } from "@services/ui/overlay-ws-state.service";
import { ChannelImageLoaderService } from "@services/ui/channel-image-loader.service";
import {
  buildChannelRef,
  findChannelByRef,
  migrateLegacyChannelRefs,
} from "@utils/channel-ref.util";

/* helpers */
import {
  getDensityTextClasses,
  getPlatformBadgeClasses,
  getPlatformLabel,
  isSafeRemoteImageUrl,
} from "@helpers/chat.helper";
@Component({
  selector: "app-overlay-view",
  standalone: true,
  imports: [NgStyle, MatIconModule, MatTooltipModule],
  templateUrl: "./overlay.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "block h-full min-h-0",
  },
})
export class OverlayView implements OnDestroy {
  readonly dashboardState = inject(DashboardStateService);
  readonly overlayWs = inject(OverlayWsStateService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly richText = inject(ChatRichTextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly authService = inject(AuthorizationService);
  private readonly twitchChat = inject(TwitchChatService);
  private readonly kickChat = inject(KickChatService);
  private readonly chatList = inject(ChatListService);
  private readonly avatarCache = inject(AvatarCacheService);
  private readonly channelImageLoader = inject(ChannelImageLoaderService);
  private configPollInterval: ReturnType<typeof setInterval> | null = null;
  private lastKnownConfig: Map<string, string> = new Map();
  private readonly pendingUserAvatarLoads = new Set<string>();
  private readonly pendingChannelAvatarLoads = new Set<string>();
  private readonly messageSegmentsCache = new Map<
    string,
    { text: string; segments: ChatTextSegment[] }
  >();
  private readonly brokenEmoteUrls = new Set<string>();
  private readonly onOverlayConfigChangedHandler = () => this.onOverlayConfigChanged();

  readonly customCssText = signal<string>("");
  readonly textSize = signal<number>(16);
  readonly animationType = signal<OverlayAnimationType>("fade");
  readonly animationDirection = signal<OverlayDirection>("top");
  readonly maxMessages = signal<number>(6);
  readonly transparentBg = signal<boolean>(true);

  readonly animationCssText = computed(() => this.animationCss());

  readonly backgroundColor = computed(() => {
    return this.transparentBg() ? "transparent" : "rgba(0, 0, 0, 1)";
  });

  readonly activeWidget: WidgetConfig | null = (() => {
    const widgetId = new URLSearchParams(window.location.search).get("widgetId");
    const all = this.dashboardState.widgets();
    if (widgetId) {
      return all.find((w) => w.id === widgetId) ?? this.dashboardState.featuredWidget();
    }
    return this.dashboardState.featuredWidget();
  })();

  constructor() {
    const widget = this.activeWidget;
    if (!widget) {
      return;
    }

    this.widgetId = widget.id;
    this.widget = widget;

    void this.initializeOverlayRuntime(widget);

    // Same-tab updates (management page saves in the same window).
    window.addEventListener("unichat-overlay-config-changed", this.onOverlayConfigChangedHandler);

    // Auto-trigger change detection when config signals change
    effect(() => {
      // Read all config signals to trigger CD when they change
      this.textSize();
      this.animationType();
      this.animationDirection();
      this.maxMessages();
      this.customCssText();
      this.backgroundColor();
      this.cdr.markForCheck();
    });

    // Load avatars based on currently queued overlay messages.
    // This keeps `getChannelImageUrl()` / `getUserImageUrl()` side-effect free.
    effect(() => {
      const messages = this.overlayWs.messages();
      const changed = this.ensureAvatarCachesForMessages(messages);
      if (changed) {
        this.cdr.markForCheck();
      }
    });

    // Poll backend for config changes (works across all Tauri windows)
    this.startBackendConfigPolling(widget.id);
  }

  private widgetId: string = "";
  private widget: WidgetConfig | null = null;
  private currentFilter: WidgetFilter = "all";
  private currentChannelIds: string[] | undefined = undefined;

  private async initializeOverlayRuntime(widget: WidgetConfig): Promise<void> {
    const serverStarted = await this.ensureOverlayServerStarted(widget.port);
    if (!serverStarted) {
      return;
    }

    // 2. Wait for server to be ready (prevent race condition)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 3. Load config from backend BEFORE WebSocket connect
    await this.loadAndApplyConfigFromBackend();

    const channelIds = this.extractChannelIdsFromSelection(this.currentChannelIds);

    this.overlayWs.connect({
      port: widget.port,
      widgetId: widget.id,
      filter: this.currentFilter,
      channelIds: channelIds,
      preserveMessages: true, // Preserve messages on reconnect to prevent flickering
      maxMessages: this.maxMessages(),
    });
  }

  private async ensureOverlayServerStarted(port: number): Promise<boolean> {
    try {
      await invoke("startOverlayServer", { port });
      return true;
    } catch {
      // In browser-only contexts (for example OBS), Tauri invoke may be unavailable.
      // The overlay server should already be serving this page there, so continue.
      return true;
    }
  }

  private loadAndApplyConfig(): void {
    const widget = this.widget;
    if (!widget) return;

    this.currentFilter = readOverlayFilterOverride(widget.id) ?? widget.filter;
    this.currentChannelIds = migrateLegacyChannelRefs(
      readOverlayChannelIds(widget.id) ?? widget.channelIds,
      this.chatList.getVisibleChannels()
    );
    const customCss = readOverlayCustomCss(widget.id);
    const textSize = readOverlayTextSize(widget.id) ?? 16;
    const animationType = readOverlayAnimationType(widget.id) ?? "fade";
    const animationDirection = readOverlayAnimationDirection(widget.id) ?? "top";
    const maxMessages = readOverlayMaxMessages(widget.id) ?? 6;
    // Default to transparent background for OBS compatibility
    const transparentBg = readOverlayTransparentBg(widget.id) ?? true;

    this.customCssText.set(customCss);
    this.textSize.set(textSize);
    this.animationType.set(animationType);
    this.animationDirection.set(animationDirection);
    this.maxMessages.set(maxMessages);
    this.transparentBg.set(transparentBg);
  }

  private async loadAndApplyConfigFromBackend(): Promise<void> {
    const widget = this.widget;
    if (!widget) return;

    try {
      // Try to fetch config from backend first (cross-window shared storage)
      let config: WidgetConfig | null = null;

      // Try Tauri invoke first (works in preview window)
      try {
        config = await invoke<WidgetConfig>("getOverlayConfig", { widgetId: widget.id });
      } catch {
        // Tauri invoke failed (e.g., in OBS browser source), try HTTP fallback
        try {
          const port = widget.port;
          const response = await fetch(
            `http://127.0.0.1:${port}/api/overlay/${encodeURIComponent(widget.id)}/config`
          );
          if (response.ok) {
            config = await response.json();
          }
        } catch {
          /* HTTP fallback unavailable */
        }
      }

      if (config) {
        // Use backend config if available
        this.currentFilter = (config.filter as WidgetFilter) ?? widget.filter;
        this.currentChannelIds = migrateLegacyChannelRefs(
          config.channelIds ?? widget.channelIds,
          this.chatList.getVisibleChannels()
        );
        this.customCssText.set(config.customCss ?? "");
        this.textSize.set(config.textSize ?? 16);
        this.animationType.set((config.animationType as OverlayAnimationType) ?? "fade");
        this.animationDirection.set((config.animationDirection as OverlayDirection) ?? "top");
        this.maxMessages.set(config.maxMessages ?? 6);
        // Default to transparent background for OBS compatibility
        this.transparentBg.set(config.transparentBg ?? true);
      } else {
        // Fallback to localStorage if no backend config
        this.loadAndApplyConfig();
      }
    } catch {
      this.loadAndApplyConfig();
    }
  }

  private onOverlayConfigChanged(): void {
    // Reload config from backend (not localStorage) when config changes
    this.loadAndApplyConfigFromBackend().then(() => {
      // Reconnect WebSocket with new filter/channels
      const channelIds = this.extractChannelIdsFromSelection(this.currentChannelIds);
      this.overlayWs.connect({
        port: this.widget!.port,
        widgetId: this.widget!.id,
        filter: this.currentFilter,
        channelIds: channelIds,
        preserveMessages: true, // Preserve messages when config changes
        maxMessages: this.maxMessages(),
      });
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.configPollInterval) {
      clearInterval(this.configPollInterval);
    }

    // Remove global listener to prevent leaks on repeated mount/unmount.
    window.removeEventListener(
      "unichat-overlay-config-changed",
      this.onOverlayConfigChangedHandler
    );
  }

  private async startBackendConfigPolling(widgetId: string): Promise<void> {
    // Initialize last known config from backend
    await this.pollBackendConfig(widgetId);

    // Poll every 2 seconds for config changes (less aggressive)
    this.configPollInterval = setInterval(async () => {
      await this.pollBackendConfig(widgetId);
    }, 2000);
  }

  private async pollBackendConfig(widgetId: string): Promise<void> {
    try {
      // Try Tauri command first (works in preview window)
      let config: WidgetConfig | null = null;
      try {
        config = await invoke<WidgetConfig>("getOverlayConfig", { widgetId });
      } catch (tauriError) {
        // Tauri invoke failed (e.g., in OBS browser source), try HTTP fallback
        try {
          const port = this.widget?.port || 1450;
          const response = await fetch(
            `http://127.0.0.1:${port}/api/overlay/${encodeURIComponent(widgetId)}/config`
          );
          if (response.ok) {
            config = await response.json();
          }
        } catch {
          /* HTTP fallback unavailable */
        }
      }

      if (!config) {
        // No config stored yet, use defaults
        return;
      }

      const currentFilter = config.filter || "all";
      const currentCss = config.customCss || "";
      const currentChannels = migrateLegacyChannelRefs(
        config.channelIds,
        this.chatList.getVisibleChannels()
      );
      const currentChannelsCanonical = this.canonicalizeChannelRefs(currentChannels);
      const currentTextSize = config.textSize || 16;
      const currentAnimationType = config.animationType || "fade";
      const currentAnimationDirection = config.animationDirection || "top";
      const currentMaxMessages = config.maxMessages || 6;
      const currentTransparentBg = config.transparentBg || false;

      const prevFilter = this.lastKnownConfig.get("filter");
      const prevChannelsCanonical = this.lastKnownConfig.get("channelsCanonical");

      const hasFilterOrChannelsChanged =
        prevFilter !== currentFilter || prevChannelsCanonical !== currentChannelsCanonical;

      const hasChanged =
        hasFilterOrChannelsChanged ||
        this.lastKnownConfig.get("css") !== currentCss ||
        this.lastKnownConfig.get("textSize") !== String(currentTextSize) ||
        this.lastKnownConfig.get("animationType") !== currentAnimationType ||
        this.lastKnownConfig.get("animationDirection") !== currentAnimationDirection ||
        this.lastKnownConfig.get("maxMessages") !== String(currentMaxMessages) ||
        this.lastKnownConfig.get("transparentBg") !== String(currentTransparentBg);

      if (hasChanged) {
        this.lastKnownConfig.set("filter", currentFilter);
        this.lastKnownConfig.set("css", currentCss);
        this.lastKnownConfig.set("channelsCanonical", currentChannelsCanonical ?? "");
        this.lastKnownConfig.set("textSize", String(currentTextSize));
        this.lastKnownConfig.set("animationType", currentAnimationType);
        this.lastKnownConfig.set("animationDirection", currentAnimationDirection);
        this.lastKnownConfig.set("maxMessages", String(currentMaxMessages));
        this.lastKnownConfig.set("transparentBg", String(currentTransparentBg));

        // Apply new config
        this.currentFilter = currentFilter as WidgetFilter;
        this.currentChannelIds = currentChannels;
        this.customCssText.set(currentCss);
        this.textSize.set(currentTextSize);
        this.animationType.set(currentAnimationType as OverlayAnimationType);
        this.animationDirection.set(currentAnimationDirection as OverlayDirection);
        this.maxMessages.set(currentMaxMessages);
        this.transparentBg.set(currentTransparentBg);

        // Reconnect WebSocket only if filter/channels set changed.
        if (hasFilterOrChannelsChanged) {
          const channelIds = this.extractChannelIdsFromSelection(this.currentChannelIds);
          this.overlayWs.connect({
            port: this.widget!.port,
            widgetId: this.widget!.id,
            filter: this.currentFilter,
            channelIds: channelIds,
            preserveMessages: true, // Preserve messages when config changes
            maxMessages: this.maxMessages(),
          });

          // Poll messages from backend after filter/channels change.
          await this.pollBackendMessages(widgetId, currentChannels);
        }

        this.cdr.markForCheck();
      }
    } catch {
      /* poll failed */
    }
  }

  private async pollBackendMessages(
    widgetId: string,
    channelIds: string[] | undefined
  ): Promise<void> {
    try {
      const messages = await invoke<OverlayChatMessage[]>("getOverlayMessages", {
        widgetId,
        limit: this.maxMessages(),
        channelIds,
      });

      // Merge messages from backend instead of replacing
      // This prevents race conditions with WebSocket message delivery
      if (messages.length > 0) {
        // Add each message individually using upsert logic
        for (const message of messages) {
          this.overlayWs.addMessage(message);
        }
      }
    } catch (e) {
      // Silently fail - WebSocket should handle it
    }
  }

  /**
   * Extract channel IDs from selection for backend filtering.
   * Channel IDs are stored as canonical channel refs (`platform:providerChannelId`).
   */
  private extractChannelIdsFromSelection(channelIds: string[] | undefined): string[] | undefined {
    if (channelIds === undefined) {
      return undefined;
    }
    // Ensure stable ordering to avoid WS reconnect storms.
    return [...channelIds].sort();
  }

  private canonicalizeChannelRefs(channelRefs: string[] | undefined): string | null {
    if (!channelRefs || channelRefs.length === 0) {
      return null;
    }
    return [...channelRefs].sort().join("|");
  }

  platformLabel(platform: PlatformType): string {
    return getPlatformLabel(platform);
  }

  platformBadgeClasses(platform: PlatformType): string {
    return `${getPlatformBadgeClasses(platform)} px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]`;
  }

  densityTextClasses(densityMode: DensityMode): string {
    return getDensityTextClasses(densityMode);
  }

  hasMultipleChannels(): boolean {
    return (this.currentChannelIds?.length ?? 0) > 1;
  }

  shouldShowPlatformIcon(message: OverlayChatMessage): boolean {
    return this.hasMultipleChannels() && !!this.presentation.platformIconUrl(message.platform);
  }

  shouldShowChannelImage(message: OverlayChatMessage): boolean {
    return this.hasMultipleChannels() && !!this.getChannelImageUrl(message);
  }

  shouldShowUserImage(message: OverlayChatMessage): boolean {
    return !!this.getUserImageUrl(message);
  }

  shouldShowAuthorInitial(message: OverlayChatMessage): boolean {
    return !this.hasMultipleChannels() && !this.shouldShowUserImage(message);
  }

  channelInitial(message: OverlayChatMessage): string {
    return this.channelTitle(message).trim().charAt(0).toUpperCase();
  }

  authorInitial(message: OverlayChatMessage): string {
    return message.author.trim().charAt(0).toUpperCase();
  }

  shouldShowPlatformContextIcon(): boolean {
    return this.hasMultipleChannels();
  }

  /**
   * Get channel profile image URL for overlay messages
   * Currently supports Twitch multi-chat channels
   */
  private ensureAvatarCachesForMessages(messages: readonly OverlayChatMessage[]): boolean {
    let changed = false;

    for (const message of messages) {
      // Channel avatar
      if (message.sourceChannelId) {
        const channelCacheKey = this.channelAvatarCacheKey(message);

        // Prefer direct provider-provided URL (if safe), but only set if missing.
        if (isSafeRemoteImageUrl(message.channelImageUrl)) {
          const directUrl = message.channelImageUrl!.trim();
          if (!this.avatarCache.hasChannelAvatar(channelCacheKey)) {
            this.avatarCache.setChannelAvatar(channelCacheKey, directUrl);
            changed = true;
          }
        }

        if (!this.avatarCache.hasChannelAvatar(channelCacheKey)) {
          const channel = findChannelByRef(
            this.chatList.getChannels(message.platform),
            buildChannelRef(message.platform, message.sourceChannelId)
          );

          if (channel && isSafeRemoteImageUrl(channel.channelImageUrl)) {
            const imageUrl = channel.channelImageUrl!.trim();
            this.avatarCache.setChannelAvatar(channelCacheKey, imageUrl);
            changed = true;
          } else if (!this.pendingChannelAvatarLoads.has(channelCacheKey)) {
            // Fallback: fetch via provider APIs (optional).
            if (message.platform === "twitch" && channel) {
              this.pendingChannelAvatarLoads.add(channelCacheKey);
              void this.fetchTwitchChannelImage(channel.channelName, channelCacheKey);
            } else if (message.platform === "kick" && channel) {
              this.pendingChannelAvatarLoads.add(channelCacheKey);
              void this.fetchKickChannelImage(channel.channelName, channelCacheKey);
            } else if (message.platform === "youtube" && channel) {
              this.pendingChannelAvatarLoads.add(channelCacheKey);
              void this.fetchYouTubeChannelImage(channel.channelName, channelCacheKey);
            }
          }
        }
      }

      // User avatar
      const userCacheKey = this.userAvatarCacheKey(message);

      if (isSafeRemoteImageUrl(message.authorAvatarUrl)) {
        const directUrl = message.authorAvatarUrl!.trim();
        if (!this.avatarCache.hasUserAvatar(userCacheKey)) {
          this.avatarCache.setUserAvatar(userCacheKey, directUrl);
          changed = true;
        }
      }

      if (
        !this.avatarCache.hasUserAvatar(userCacheKey) &&
        !isSafeRemoteImageUrl(message.authorAvatarUrl)
      ) {
        if (!this.pendingUserAvatarLoads.has(userCacheKey)) {
          this.pendingUserAvatarLoads.add(userCacheKey);
          if (message.platform === "twitch") {
            void this.fetchTwitchUserImage(message.author, userCacheKey);
          } else if (message.platform === "kick") {
            void this.fetchKickUserImage(message.author, userCacheKey);
          }
        }
      }
    }

    return changed;
  }

  isEmoteUrlBroken(url: string | undefined | null): boolean {
    return !!url && this.brokenEmoteUrls.has(url);
  }

  onEmoteImageError(url: string | undefined | null): void {
    if (!url) {
      return;
    }
    if (!this.brokenEmoteUrls.has(url)) {
      this.brokenEmoteUrls.add(url);
      this.cdr.markForCheck();
    }
  }

  getChannelImageUrl(message: OverlayChatMessage): string | null {
    if (!message.sourceChannelId) {
      return null;
    }

    if (isSafeRemoteImageUrl(message.channelImageUrl)) {
      return message.channelImageUrl!.trim();
    }

    // Check cache
    const cacheKey = this.channelAvatarCacheKey(message);
    const cached = this.avatarCache.getChannelAvatar(cacheKey);
    if (cached) {
      return cached;
    }

    // Try to get from ChatListService (may already have image loaded)
    const channel = this.chatList
      .getChannels(message.platform)
      .find((ch) => ch.channelId === message.sourceChannelId);

    if (channel?.channelImageUrl) {
      return channel.channelImageUrl;
    }

    return null;
  }

  getUserImageUrl(message: OverlayChatMessage): string | null {
    const cacheKey = this.userAvatarCacheKey(message);

    if (isSafeRemoteImageUrl(message.authorAvatarUrl)) {
      return message.authorAvatarUrl!.trim();
    }

    return this.avatarCache.getUserAvatar(cacheKey) ?? null;
  }

  /**
   * Fetch Twitch channel image and cache it
   */
  private async fetchTwitchChannelImage(channelName: string, cacheKey: string): Promise<void> {
    try {
      const imageUrl = await this.twitchChat.fetchUserProfileImage(channelName);
      if (imageUrl) {
        this.avatarCache.setChannelAvatar(cacheKey, imageUrl);
      }
    } catch {
      // Ignore errors - channel images are optional
    } finally {
      this.pendingChannelAvatarLoads.delete(cacheKey);
      this.cdr.markForCheck();
    }
  }

  private async fetchKickChannelImage(channelName: string, cacheKey: string): Promise<void> {
    try {
      const info = await this.kickChat.fetchUserInfo(channelName);
      if (info?.profile_pic_url) {
        this.avatarCache.setChannelAvatar(cacheKey, info.profile_pic_url);
      }
    } catch {
      // Ignore errors - channel images are optional
    } finally {
      this.pendingChannelAvatarLoads.delete(cacheKey);
      this.cdr.markForCheck();
    }
  }

  private async fetchTwitchUserImage(username: string, cacheKey: string): Promise<void> {
    try {
      const imageUrl = await this.twitchChat.fetchUserProfileImage(username);
      if (imageUrl) {
        this.avatarCache.setUserAvatar(cacheKey, imageUrl);
      }
    } catch {
      // Ignore errors - author avatars are optional
    } finally {
      this.pendingUserAvatarLoads.delete(cacheKey);
      this.cdr.markForCheck();
    }
  }

  private async fetchKickUserImage(username: string, cacheKey: string): Promise<void> {
    try {
      const info = await this.kickChat.fetchUserInfo(username);
      if (info?.profile_pic_url) {
        this.avatarCache.setUserAvatar(cacheKey, info.profile_pic_url);
      }
    } catch {
      // Ignore errors - author avatars are optional
    } finally {
      this.pendingUserAvatarLoads.delete(cacheKey);
      this.cdr.markForCheck();
    }
  }

  private async fetchYouTubeChannelImage(channelName: string, cacheKey: string): Promise<void> {
    try {
      // Try to get channel image via YouTube Data API
      const account = this.authService.getPrimaryAccount("youtube");
      if (account?.accessToken) {
        const info = await invoke<YouTubeChannelInfo>("youtubeFetchChannelInfo", {
          channelName,
          accessToken: account.accessToken,
        });
        if (info?.thumbnailUrl) {
          this.avatarCache.setChannelAvatar(cacheKey, info.thumbnailUrl);
        }
      }
    } catch {
      // Ignore errors - channel images are optional
    } finally {
      this.pendingChannelAvatarLoads.delete(cacheKey);
      this.cdr.markForCheck();
    }
  }

  channelTitle(message: OverlayChatMessage): string {
    const channel = this.chatList
      .getChannels(message.platform)
      .find((item) => item.channelId === message.sourceChannelId);
    return channel?.channelName ?? message.sourceChannelId ?? this.platformLabel(message.platform);
  }

  messageTimeLabel(message: OverlayChatMessage): string {
    return new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  overlayMessages(): OverlayChatMessage[] {
    const messages = this.overlayWs.messages();

    // Filter by enabled channels
    // Extract plain channel IDs from stored channel.id format for filtering
    const channelRefs = this.extractChannelIdsFromSelection(this.currentChannelIds);

    if (this.currentChannelIds !== undefined && this.currentChannelIds !== null) {
      if (this.currentChannelIds.length === 0) {
        return [];
      }
      const filtered = messages.filter((msg) => {
        const channelRef = buildChannelRef(msg.platform, msg.sourceChannelId || "");
        return channelRefs!.includes(channelRef);
      });
      return filtered.slice(0, this.maxMessages());
    }

    return messages.slice(0, this.maxMessages());
  }

  /**
   * Returns messages in the correct order based on animationDirection setting.
   * - "top" or "left" = top-down flow (newest at bottom, normal order)
   * - "bottom" or "right" = bottom-up flow (newest at top, reversed order)
   */
  orderedMessages(): OverlayChatMessage[] {
    const messages = this.overlayMessages();
    const direction = this.animationDirection();

    // For "bottom" or "right" direction, reverse the order (newest at top)
    if (direction === "bottom" || direction === "right") {
      return [...messages].reverse();
    }

    // For "top" or "left" direction, keep normal order (newest at bottom)
    return messages;
  }

  animationCss(): string {
    const type = this.animationType();
    const dir = this.animationDirection();

    if (type === "none") {
      return "";
    }

    let transformStart = "";
    let transformEnd = "translate(0, 0)";

    switch (dir) {
      case "top":
        transformStart = "translateY(-100%)";
        break;
      case "bottom":
        transformStart = "translateY(100%)";
        break;
      case "left":
        transformStart = "translateX(-100%)";
        break;
      case "right":
        transformStart = "translateX(100%)";
        break;
    }

    // Deterministic animation name so Angular re-renders don't continuously recreate keyframes.
    const animId = `anim-${type}-${dir}-${this.widgetId}`;

    if (type === "fade") {
      return `
        @keyframes ${animId}-fade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .message-item {
          animation: ${animId}-fade 0.4s ease-out forwards;
        }
      `;
    }

    if (type === "slide") {
      return `
        @keyframes ${animId}-slide {
          0% { opacity: 0; transform: ${transformStart}; }
          100% { opacity: 1; transform: ${transformEnd}; }
        }
        .message-item {
          animation: ${animId}-slide 0.4s ease-out forwards;
        }
      `;
    }

    if (type === "pop") {
      return `
        @keyframes ${animId}-pop {
          0% { opacity: 0; transform: scale(0.5); }
          100% { opacity: 1; transform: scale(1); }
        }
        .message-item {
          animation: ${animId}-pop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
        }
      `;
    }

    return "";
  }

  getMessageSegments(message: OverlayChatMessage): ChatTextSegment[] {
    // Create a minimal ChatMessage-like object for rich text parsing
    const chatMessage: ChatMessage = {
      id: message.id,
      platform: message.platform,
      sourceMessageId: message.id,
      sourceChannelId: message.sourceChannelId || "",
      sourceUserId: message.author,
      author: message.author,
      text: message.text,
      timestamp: message.timestamp,
      badges: [],
      isSupporter: message.isSupporter,
      isOutgoing: false,
      isDeleted: false,
      canRenderInOverlay: true,
      actions: {
        reply: { status: "disabled", kind: "reply" },
        delete: { status: "disabled", kind: "delete" },
      },
      rawPayload: {
        emotes: message.emotes ?? [],
        badgeIcons: [],
        providerEvent: "",
        providerChannelId: message.sourceChannelId || "",
        providerUserId: message.author,
        preview: message.text,
      },
      authorAvatarUrl: message.authorAvatarUrl,
    };

    // No caching - compute segments on each call to avoid signal write errors
    return this.richText.buildSegments(chatMessage);
  }

  messagesContainerClasses(): string {
    // Always use vertical column layout for messages
    return "flex-col";
  }

  widgetSummary(): string {
    const widget = this.activeWidget;
    if (!widget) {
      return "Widget preview unavailable";
    }

    const effectiveFilter = readOverlayFilterOverride(widget.id) ?? widget.filter;
    const channelIds = migrateLegacyChannelRefs(
      readOverlayChannelIds(widget.id) ?? widget.channelIds,
      this.chatList.getVisibleChannels()
    );
    const channelCount = channelIds?.length ?? 0;
    const channelLabel = channelCount > 0 ? `${channelCount} channel(s)` : "all channels";
    const filterLabel = effectiveFilter === "all" ? "All chat" : "Supporters only";
    return `${filterLabel} • ${channelLabel} • ${this.overlayWs.messages().length} queued`;
  }

  messageFullTimeLabel(message: OverlayChatMessage): string {
    return new Date(message.timestamp).toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  private channelAvatarCacheKey(message: OverlayChatMessage): string {
    return `${message.platform}:${message.sourceChannelId ?? ""}`;
  }

  private userAvatarCacheKey(message: OverlayChatMessage): string {
    return `${message.platform}:${message.sourceChannelId ?? ""}:${message.author.trim().toLowerCase()}`;
  }
}

function overlayFilterOverrideKey(widgetId: string): string {
  return `unichat-overlay-filter-override:${widgetId}`;
}

function readOverlayFilterOverride(widgetId: string): WidgetFilter | null {
  const raw = localStorage.getItem(overlayFilterOverrideKey(widgetId));
  if (raw === "all" || raw === "supporters") {
    return raw;
  }
  return null;
}

function overlayCustomCssKey(widgetId: string): string {
  return `unichat-overlay-custom-css:${widgetId}`;
}

function readOverlayCustomCss(widgetId: string): string {
  return localStorage.getItem(overlayCustomCssKey(widgetId)) ?? "";
}

function overlayChannelIdsKey(widgetId: string): string {
  return `unichat-overlay-channel-ids:${widgetId}`;
}

function readOverlayChannelIds(widgetId: string): string[] | null {
  const raw = localStorage.getItem(overlayChannelIdsKey(widgetId));
  if (raw) {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return null;
    }
  }
  return null;
}

function overlayMaxMessagesKey(widgetId: string): string {
  return `unichat-overlay-max-messages:${widgetId}`;
}

function readOverlayMaxMessages(widgetId: string): number | null {
  const raw = localStorage.getItem(overlayMaxMessagesKey(widgetId));
  if (raw) {
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function overlayTextSizeKey(widgetId: string): string {
  return `unichat-overlay-text-size:${widgetId}`;
}

function readOverlayTextSize(widgetId: string): number | null {
  const raw = localStorage.getItem(overlayTextSizeKey(widgetId));
  if (raw) {
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function overlayAnimationTypeKey(widgetId: string): string {
  return `unichat-overlay-animation-type:${widgetId}`;
}

function readOverlayAnimationType(widgetId: string): OverlayAnimationType | null {
  const raw = localStorage.getItem(overlayAnimationTypeKey(widgetId));
  if (raw === "none" || raw === "fade" || raw === "slide" || raw === "pop") {
    return raw;
  }
  return null;
}

function overlayAnimationDirectionKey(widgetId: string): string {
  return `unichat-overlay-animation-direction:${widgetId}`;
}

function readOverlayAnimationDirection(widgetId: string): OverlayDirection | null {
  const raw = localStorage.getItem(overlayAnimationDirectionKey(widgetId));
  if (raw === "top" || raw === "bottom" || raw === "left" || raw === "right") {
    return raw;
  }
  return null;
}

function overlayTransparentBgKey(widgetId: string): string {
  return `unichat-overlay-transparent-bg:${widgetId}`;
}

function readOverlayTransparentBg(widgetId: string): boolean | null {
  const raw = localStorage.getItem(overlayTransparentBgKey(widgetId));
  if (raw === "true" || raw === "false") {
    return raw === "true";
  }
  return null;
}
