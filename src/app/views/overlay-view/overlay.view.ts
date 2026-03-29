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

/* services */
import { AvatarCacheService } from "@services/core/avatar-cache.service";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { TwitchChatService } from "@services/providers/twitch-chat.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChatRichTextService, ChatTextSegment } from "@services/ui/chat-rich-text.service";
import { OverlayChatMessage, OverlayWsStateService } from "@services/ui/overlay-ws-state.service";
import {
  buildChannelRef,
  findChannelByRef,
  migrateLegacyChannelRefs,
  parseChannelRef,
} from "@utils/channel-ref.util";

/* helpers */
import {
  getDensityTextClasses,
  getPlatformBadgeClasses,
  getPlatformLabel,
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
  private readonly twitchChat = inject(TwitchChatService);
  private readonly kickChat = inject(KickChatService);
  private readonly chatList = inject(ChatListService);
  private readonly avatarCache = inject(AvatarCacheService);
  private configPollInterval: ReturnType<typeof setInterval> | null = null;
  private lastKnownConfig: Map<string, string> = new Map();

  readonly customCssText = signal<string>("");
  readonly textSize = signal<number>(16);
  readonly animationType = signal<OverlayAnimationType>("fade");
  readonly animationDirection = signal<OverlayDirection>("top");
  readonly maxMessages = signal<number>(6);
  readonly transparentBg = signal<boolean>(false);

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
      console.error("[OverlayView] No active widget found");
      return;
    }

    this.widgetId = widget.id;
    this.widget = widget;

    void this.initializeOverlayRuntime(widget);

    // Same-tab updates (management page saves in the same window).
    window.addEventListener("unichat-overlay-config-changed", () => this.onOverlayConfigChanged());

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

    // Poll backend for config changes (works across all Tauri windows)
    this.startBackendConfigPolling(widget.id);
  }

  private widgetId: string = "";
  private widget: WidgetConfig | null = null;
  private currentFilter: WidgetFilter = "all";
  private currentChannelIds: string[] | undefined = undefined;

  private async initializeOverlayRuntime(widget: WidgetConfig): Promise<void> {
    console.log('[OverlayView] Initializing overlay runtime for widget:', widget.id, 'port:', widget.port);
    
    // 1. Start overlay server first with proper error handling
    const serverStarted = await this.ensureOverlayServerStarted(widget.port);
    if (!serverStarted) {
      console.error('[OverlayView] Failed to start overlay server on port', widget.port);
      return;
    }

    // 2. Wait for server to be ready (prevent race condition)
    await new Promise(resolve => setTimeout(resolve, 150));

    // 3. Load config from backend BEFORE WebSocket connect
    await this.loadAndApplyConfigFromBackend();

    console.log('[OverlayView] Config loaded, currentChannelIds:', this.currentChannelIds);

    // 4. Extract channel IDs and connect WebSocket
    const channelIds = this.extractChannelIdsFromSelection(this.currentChannelIds);
    console.log('[OverlayView] Connecting overlay WebSocket with channelIds:', channelIds);
    
    this.overlayWs.connect({
      port: widget.port,
      widgetId: widget.id,
      filter: this.currentFilter,
      channelIds: channelIds,
      preserveMessages: true, // Preserve messages on reconnect to prevent flickering
    });
  }

  private async ensureOverlayServerStarted(port: number): Promise<boolean> {
    try {
      await invoke("startOverlayServer", { port });
      console.log('[OverlayView] Overlay server started on port', port);
      return true;
    } catch (error) {
      // In browser-only contexts (for example OBS), Tauri invoke may be unavailable.
      // The overlay server should already be serving this page there, so continue.
      console.warn("[OverlayView] Unable to ensure overlay server is started (may be in OBS):", error);
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
    const transparentBg = readOverlayTransparentBg(widget.id) ?? false;

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
      const config = await invoke<WidgetConfig>("getOverlayConfig", { widgetId: widget.id });

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
        this.transparentBg.set(config.transparentBg ?? false);
      } else {
        // Fallback to localStorage if no backend config
        this.loadAndApplyConfig();
      }
    } catch (error) {
      console.warn("[OverlayView] Failed to fetch backend config, using localStorage:", error);
      // Fallback to localStorage
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
      });
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.configPollInterval) {
      clearInterval(this.configPollInterval);
    }
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
          const port = this.widget?.port || 1421;
          const response = await fetch(
            `http://127.0.0.1:${port}/api/overlay/${encodeURIComponent(widgetId)}/config`
          );
          if (response.ok) {
            config = await response.json();
          }
        } catch (httpError) {
          console.warn("[OverlayView] HTTP config fetch failed:", httpError);
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
      const currentTextSize = config.textSize || 16;
      const currentAnimationType = config.animationType || "fade";
      const currentAnimationDirection = config.animationDirection || "top";
      const currentMaxMessages = config.maxMessages || 6;
      const currentTransparentBg = config.transparentBg || false;

      const hasChanged =
        this.lastKnownConfig.get("filter") !== currentFilter ||
        this.lastKnownConfig.get("css") !== currentCss ||
        this.lastKnownConfig.get("channels") !== JSON.stringify(currentChannels ?? null) ||
        this.lastKnownConfig.get("textSize") !== String(currentTextSize) ||
        this.lastKnownConfig.get("animationType") !== currentAnimationType ||
        this.lastKnownConfig.get("animationDirection") !== currentAnimationDirection ||
        this.lastKnownConfig.get("maxMessages") !== String(currentMaxMessages) ||
        this.lastKnownConfig.get("transparentBg") !== String(currentTransparentBg);

      if (hasChanged) {
        this.lastKnownConfig.set("filter", currentFilter);
        this.lastKnownConfig.set("css", currentCss);
        this.lastKnownConfig.set("channels", JSON.stringify(currentChannels ?? null));
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

        // Reconnect WebSocket with new filter/channels
        const channelIds = this.extractChannelIdsFromSelection(this.currentChannelIds);
        this.overlayWs.connect({
          port: this.widget!.port,
          widgetId: this.widget!.id,
          filter: this.currentFilter,
          channelIds: channelIds,
          preserveMessages: true, // Preserve messages when config changes
        });

        // Poll messages from backend after config change
        await this.pollBackendMessages(widgetId, currentChannels);

        this.cdr.markForCheck();
      }
    } catch (e) {
      console.warn("[OverlayView] Failed to poll backend config:", e);
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
    return channelIds;
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

  /**
   * Check if selected channels are from multiple different services/platforms.
   * Returns true if channels from different platforms are selected (e.g., Twitch + Kick).
   */
  hasMultipleServices(): boolean {
    if (!this.currentChannelIds || this.currentChannelIds.length <= 1) {
      return false;
    }
    const platforms = new Set<string>();
    for (const channelId of this.currentChannelIds) {
      const parsed = parseChannelRef(channelId);
      platforms.add(parsed?.platform ?? "unknown");
      if (platforms.size > 1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if multiple channels from the same service/platform are selected.
   * Returns true if 2+ channels from the same platform are selected.
   */
  hasMultipleChannelsFromSameService(): boolean {
    if (!this.currentChannelIds || this.currentChannelIds.length <= 1) {
      return false;
    }
    const platformCounts = new Map<string, number>();
    for (const channelId of this.currentChannelIds) {
      const parsed = parseChannelRef(channelId);
      const platform = parsed?.platform ?? "unknown";
      const count = (platformCounts.get(platform) ?? 0) + 1;
      platformCounts.set(platform, count);
      if (count > 1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get channel profile image URL for overlay messages
   * Currently supports Twitch multi-chat channels
   */
  getChannelImageUrl(message: OverlayChatMessage): string | null {
    if (!message.sourceChannelId) {
      return null;
    }

    if (message.channelImageUrl) {
      return message.channelImageUrl;
    }

    const cacheKey = `${message.platform}:${message.sourceChannelId}`;

    // Check cache first
    const cached = this.avatarCache.getChannelAvatar(cacheKey);
    if (cached) {
      return cached;
    }

    const channel = findChannelByRef(
      this.chatList.getChannels(message.platform),
      buildChannelRef(message.platform, message.sourceChannelId)
    );

    if (!channel) {
      if (message.platform === "youtube") {
        return `https://i.ytimg.com/vi/${encodeURIComponent(message.sourceChannelId)}/default.jpg`;
      }
      return null;
    }

    if (message.platform === "twitch") {
      void this.fetchTwitchChannelImage(channel.channelName, cacheKey);
    } else if (message.platform === "kick") {
      void this.fetchKickChannelImage(channel.channelName, cacheKey);
    } else if (message.platform === "youtube") {
      const fallback = `https://i.ytimg.com/vi/${encodeURIComponent(channel.channelId)}/default.jpg`;
      this.avatarCache.setChannelAvatar(cacheKey, fallback);
      return fallback;
    }

    return cached ?? null;
  }

  /**
   * Fetch Twitch channel image and cache it
   */
  private async fetchTwitchChannelImage(channelName: string, cacheKey: string): Promise<void> {
    try {
      const imageUrl = await this.twitchChat.fetchUserProfileImage(channelName);
      if (imageUrl) {
        this.avatarCache.setChannelAvatar(cacheKey, imageUrl);
        // Trigger change detection to update UI
        this.cdr.markForCheck();
      }
    } catch {
      // Ignore errors - channel images are optional
    }
  }

  private async fetchKickChannelImage(channelName: string, cacheKey: string): Promise<void> {
    try {
      const info = await this.kickChat.fetchUserInfo(channelName);
      if (info?.profile_pic_url) {
        this.avatarCache.setChannelAvatar(cacheKey, info.profile_pic_url);
        this.cdr.markForCheck();
      }
    } catch {
      // Ignore errors - channel images are optional
    }
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

    console.log('[OverlayView] overlayMessages() called: total messages=', messages.length, 
      '| currentChannelIds=', this.currentChannelIds, 
      '| channelRefs=', channelRefs);

    if (this.currentChannelIds !== undefined && this.currentChannelIds !== null) {
      if (this.currentChannelIds.length === 0) {
        console.log('[OverlayView] Empty channel selection, hiding all messages');
        return [];
      }
      const filtered = messages.filter((msg) => {
        const channelRef = buildChannelRef(msg.platform, msg.sourceChannelId || "");
        const isAllowed = channelRefs!.includes(channelRef);
        if (!isAllowed) {
          console.log('[OverlayView] Message filtered out:', msg.id, '| msg.channel=', channelRef, '| allowed=', channelRefs);
        }
        return isAllowed;
      });
      console.log('[OverlayView] Filtered messages:', filtered.length, 'from', messages.length);
      return filtered.slice(0, this.maxMessages());
    }

    // No channel filter = show all messages
    console.log('[OverlayView] No channel filter, showing all messages');
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

    // Generate unique animation name to avoid conflicts
    const animId = `anim-${type}-${dir}-${Date.now()}`;

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
