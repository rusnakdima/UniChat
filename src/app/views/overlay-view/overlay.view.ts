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
import { NgStyle } from "@angular/common";
import {
  getDensityTextClasses,
  getPlatformBadgeClasses,
  getPlatformLabel,
} from "@helpers/chat.helper";
import {
  DensityMode,
  PlatformType,
  WidgetConfig,
  WidgetFilter,
  OverlayAnimationType,
  OverlayDirection,
  ChatMessage,
} from "@models/chat.model";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { OverlayChatMessage, OverlayWsStateService } from "@services/ui/overlay-ws-state.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChatRichTextService, ChatTextSegment } from "@services/ui/chat-rich-text.service";
import { invoke } from "@tauri-apps/api/core";

@Component({
  selector: "app-overlay-view",
  imports: [NgStyle, MatIconModule, MatTooltipModule],
  templateUrl: "./overlay.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverlayView implements OnDestroy {
  readonly dashboardState = inject(DashboardStateService);
  readonly overlayWs = inject(OverlayWsStateService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly richText = inject(ChatRichTextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private configPollInterval: ReturnType<typeof setInterval> | null = null;
  private lastKnownConfig: Map<string, string> = new Map();

  readonly customCssText = signal<string>("");
  readonly textSize = signal<number>(16);
  readonly animationType = signal<OverlayAnimationType>("fade");
  readonly animationDirection = signal<OverlayDirection>("top");
  readonly maxMessages = signal<number>(6);
  readonly transparentBg = signal<boolean>(false);
  readonly opacity = signal<number>(1.0);

  readonly backgroundColor = computed(() => {
    if (this.transparentBg()) {
      return "transparent";
    }
    // Use RGBA with opacity for background only (not content)
    const alpha = this.opacity();
    return `rgba(15, 23, 42, ${alpha})`; // slate-950 with opacity
  });

  readonly contentOpacity = computed(() => {
    // When transparentBg is enabled, apply opacity to content for OBS
    return this.opacity();
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

    this.loadAndApplyConfig();

    // Always use widget port, not window.location.port (which is Angular dev server)
    // Convert composite keys to plain channel names for backend WebSocket
    const plainChannelIds = this.getPlainChannelIds(this.currentChannelIds);
    this.overlayWs.connect({
      port: widget.port,
      widgetId: widget.id,
      filter: this.currentFilter,
      channelIds: plainChannelIds,
    });

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
      this.opacity();
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

  /**
   * Extract plain channel names from composite keys (platform:channelName) for backend API.
   * Backend stores messages by source_channel_id (plain channel name), not composite key.
   */
  private getPlainChannelIds(compositeKeys: string[] | undefined): string[] | undefined {
    if (!compositeKeys || compositeKeys.length === 0) {
      return undefined;
    }
    return compositeKeys.map((key) => {
      const parts = key.split(":");
      return parts.length > 1 ? parts[1] : key;
    });
  }

  private loadAndApplyConfig(): void {
    const widget = this.widget;
    if (!widget) return;

    this.currentFilter = readOverlayFilterOverride(widget.id) ?? widget.filter;
    this.currentChannelIds = readOverlayChannelIds(widget.id) ?? widget.channelIds;
    const customCss = readOverlayCustomCss(widget.id);
    const textSize = readOverlayTextSize(widget.id) ?? 16;
    const animationType = readOverlayAnimationType(widget.id) ?? "fade";
    const animationDirection = readOverlayAnimationDirection(widget.id) ?? "top";
    const maxMessages = readOverlayMaxMessages(widget.id) ?? 6;
    const transparentBg = readOverlayTransparentBg(widget.id) ?? false;
    const opacity = readOverlayOpacity(widget.id) ?? 1.0;

    this.customCssText.set(customCss);
    this.textSize.set(textSize);
    this.animationType.set(animationType);
    this.animationDirection.set(animationDirection);
    this.maxMessages.set(maxMessages);
    this.transparentBg.set(transparentBg);
    this.opacity.set(opacity);
  }

  private onOverlayConfigChanged(): void {
    this.loadAndApplyConfig();
    // Convert composite keys to plain channel names for backend WebSocket
    const plainChannelIds = this.getPlainChannelIds(this.currentChannelIds);
    this.overlayWs.connect({
      port: this.widget!.port,
      widgetId: this.widget!.id,
      filter: this.currentFilter,
      channelIds: plainChannelIds,
    });
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    if (this.configPollInterval) {
      clearInterval(this.configPollInterval);
    }
  }

  private async startBackendConfigPolling(widgetId: string): Promise<void> {
    // Initialize last known config from backend
    await this.pollBackendConfig(widgetId);

    // Poll every 500ms for config changes
    this.configPollInterval = setInterval(async () => {
      await this.pollBackendConfig(widgetId);
    }, 500);
  }

  private async pollBackendConfig(widgetId: string): Promise<void> {
    try {
      // Try Tauri command first (works in preview window)
      let config: any | null = null;
      try {
        config = await invoke<any>("getOverlayConfig", { widgetId });
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
      const currentChannels = config.channelIds || [];
      const currentTextSize = config.textSize || 16;
      const currentAnimationType = config.animationType || "fade";
      const currentAnimationDirection = config.animationDirection || "top";
      const currentMaxMessages = config.maxMessages || 6;
      const currentTransparentBg = config.transparentBg || false;
      const currentOpacity = config.opacity ?? 1.0;

      const hasChanged =
        this.lastKnownConfig.get("filter") !== currentFilter ||
        this.lastKnownConfig.get("css") !== currentCss ||
        this.lastKnownConfig.get("channels") !== JSON.stringify(currentChannels) ||
        this.lastKnownConfig.get("textSize") !== String(currentTextSize) ||
        this.lastKnownConfig.get("animationType") !== currentAnimationType ||
        this.lastKnownConfig.get("animationDirection") !== currentAnimationDirection ||
        this.lastKnownConfig.get("maxMessages") !== String(currentMaxMessages) ||
        this.lastKnownConfig.get("transparentBg") !== String(currentTransparentBg) ||
        this.lastKnownConfig.get("opacity") !== String(currentOpacity);

      if (hasChanged) {
        this.lastKnownConfig.set("filter", currentFilter);
        this.lastKnownConfig.set("css", currentCss);
        this.lastKnownConfig.set("channels", JSON.stringify(currentChannels));
        this.lastKnownConfig.set("textSize", String(currentTextSize));
        this.lastKnownConfig.set("animationType", currentAnimationType);
        this.lastKnownConfig.set("animationDirection", currentAnimationDirection);
        this.lastKnownConfig.set("maxMessages", String(currentMaxMessages));
        this.lastKnownConfig.set("transparentBg", String(currentTransparentBg));
        this.lastKnownConfig.set("opacity", String(currentOpacity));

        // Apply new config
        this.currentFilter = currentFilter as WidgetFilter;
        this.currentChannelIds = currentChannels;
        this.customCssText.set(currentCss);
        this.textSize.set(currentTextSize);
        this.animationType.set(currentAnimationType as OverlayAnimationType);
        this.animationDirection.set(currentAnimationDirection as OverlayDirection);
        this.maxMessages.set(currentMaxMessages);
        this.transparentBg.set(currentTransparentBg);
        this.opacity.set(currentOpacity);

        // Reconnect WebSocket with new filter/channels (convert to plain channel names)
        const plainChannelIds = this.getPlainChannelIds(this.currentChannelIds);
        this.overlayWs.connect({
          port: this.widget!.port,
          widgetId: this.widget!.id,
          filter: this.currentFilter,
          channelIds: plainChannelIds,
        });

        this.cdr.markForCheck();
      }
    } catch (e) {
      console.warn("[OverlayView] Failed to poll backend config:", e);
    }
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

  messageTimeLabel(message: OverlayChatMessage): string {
    return new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  overlayMessages(): OverlayChatMessage[] {
    const messages = this.overlayWs.messages();

    // Filter by enabled channels if channel selection is active
    // Convert composite keys (platform:channelName) to plain channel names for filtering
    // because messages have sourceChannelId as plain channel name
    const plainChannelIds = this.getPlainChannelIds(this.currentChannelIds);
    const filtered =
      plainChannelIds && plainChannelIds.length > 0
        ? messages.filter((msg) => {
            return plainChannelIds!.includes(msg.sourceChannelId || "");
          })
        : messages;

    return filtered.slice(0, this.maxMessages());
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
    const channelIds = readOverlayChannelIds(widget.id) ?? widget.channelIds;
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

function overlayOpacityKey(widgetId: string): string {
  return `unichat-overlay-opacity:${widgetId}`;
}

function readOverlayOpacity(widgetId: string): number | null {
  const raw = localStorage.getItem(overlayOpacityKey(widgetId));
  if (raw) {
    const parsed = parseFloat(raw);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}
