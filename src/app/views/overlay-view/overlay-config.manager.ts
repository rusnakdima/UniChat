import {
  Injectable,
  inject,
  signal,
  computed,
  ChangeDetectorRef,
  effect,
  OnDestroy,
} from "@angular/core";
import {
  WidgetConfig,
  WidgetFilter,
  OverlayAnimationType,
  OverlayDirection,
} from "@models/chat.model";
import { LoggerService } from "@services/core/logger.service";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { OverlayChatMessage, OverlayWsStateService } from "@services/ui/overlay-ws-state.service";
import { TauriApiService } from "@app/api/tauri-api.service";
import { migrateLegacyChannelRefs } from "@utils/channel-ref.util";
import { OverlayStorageService } from "@shared/services/overlay-storage.service";

@Injectable({ providedIn: "root" })
export class OverlayConfigManager implements OnDestroy {
  readonly dashboardState = inject(DashboardStateService);
  readonly overlayWs = inject(OverlayWsStateService);
  private readonly chatList = inject(ChatListService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly logger = inject(LoggerService);
  private readonly overlayStorage = inject(OverlayStorageService);
  private readonly tauriApi = inject(TauriApiService);

  private configPollInterval: ReturnType<typeof setInterval> | null = null;
  private lastKnownConfig: Map<string, string> = new Map();
  private readonly onOverlayConfigChangedHandler = () => this.onOverlayConfigChanged();

  readonly customCssText = signal<string>("");
  readonly textSize = signal<number>(16);
  readonly animationType = signal<OverlayAnimationType>("fade");
  readonly animationDirection = signal<OverlayDirection>("top");
  readonly maxMessages = signal<number>(6);
  readonly transparentBg = signal<boolean>(true);

  readonly animationCssText = computed(() => this.getAnimationCss());

  private widgetId: string = "";
  private widget: WidgetConfig | null = null;
  private currentFilter: WidgetFilter = "all";
  private currentChannelIds: string[] | undefined = undefined;

  getWidgetId(): string {
    return this.widgetId;
  }

  getCurrentFilter(): WidgetFilter {
    return this.currentFilter;
  }

  getCurrentChannelIds(): string[] | undefined {
    return this.currentChannelIds;
  }

  getMaxMessages(): number {
    return this.maxMessages();
  }

  getWidget(): WidgetConfig | null {
    return this.widget;
  }

  initialize(widget: WidgetConfig): void {
    this.widgetId = widget.id;
    this.widget = widget;

    window.addEventListener("unichat-overlay-config-changed", this.onOverlayConfigChangedHandler);

    effect(() => {
      this.textSize();
      this.animationType();
      this.animationDirection();
      this.maxMessages();
      this.customCssText();
      this.cdr.markForCheck();
    });
  }

  async initializeOverlayRuntime(widget: WidgetConfig): Promise<void> {
    const serverStarted = await this.ensureOverlayServerStarted(widget.port);
    if (!serverStarted) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
    await this.loadAndApplyConfigFromBackend();

    const channelIds = this.extractChannelIdsFromSelection(this.currentChannelIds);

    this.overlayWs.connect({
      port: widget.port,
      widgetId: widget.id,
      filter: this.currentFilter,
      channelIds: channelIds,
      preserveMessages: true,
      maxMessages: this.maxMessages(),
    });
  }

  private async ensureOverlayServerStarted(port: number): Promise<boolean> {
    try {
      await this.tauriApi.invoke("startOverlayServer", { port }, { suppressError: true });
      return true;
    } catch {
      return true;
    }
  }

  private loadAndApplyConfig(): void {
    const widget = this.widget;
    if (!widget) return;

    this.currentFilter = this.overlayStorage.readOverlayFilterOverride(widget.id) ?? widget.filter;
    this.currentChannelIds = migrateLegacyChannelRefs(
      this.overlayStorage.readOverlayChannelIds(widget.id) ?? widget.channelIds,
      this.chatList.getVisibleChannels()
    );
    const customCss = this.overlayStorage.readOverlayCustomCss(widget.id);
    const textSize = this.overlayStorage.readOverlayTextSize(widget.id) ?? 16;
    const animationType = this.overlayStorage.readOverlayAnimationType(widget.id) ?? "fade";
    const animationDirection =
      this.overlayStorage.readOverlayAnimationDirection(widget.id) ?? "top";
    const maxMessages = this.overlayStorage.readOverlayMaxMessages(widget.id) ?? 6;
    const transparentBg = this.overlayStorage.readOverlayTransparentBg(widget.id) ?? true;

    this.customCssText.set(customCss);
    this.textSize.set(textSize);
    this.animationType.set(animationType);
    this.animationDirection.set(animationDirection);
    this.maxMessages.set(maxMessages);
    this.transparentBg.set(transparentBg);
  }

  async loadAndApplyConfigFromBackend(): Promise<void> {
    const widget = this.widget;
    if (!widget) return;

    try {
      let config: WidgetConfig | null = null;

      try {
        config = await this.tauriApi.invoke<WidgetConfig>("getOverlayConfig", {
          widgetId: widget.id,
        });
      } catch (tauriError) {
        try {
          const port = widget.port;
          const response = await fetch(
            `http://127.0.0.1:${port}/api/overlay/${encodeURIComponent(widget.id)}/config`
          );
          if (response.ok) {
            config = await response.json();
          }
        } catch (httpError) {
          this.logger.debug("HTTP fallback unavailable for overlay config", {
            tauriError,
            httpError,
          });
        }
      }

      if (config) {
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
        this.transparentBg.set(config.transparentBg ?? true);
      } else {
        this.loadAndApplyConfig();
      }
    } catch {
      this.loadAndApplyConfig();
    }
  }

  private onOverlayConfigChanged(): void {
    this.loadAndApplyConfigFromBackend().then(() => {
      const channelIds = this.extractChannelIdsFromSelection(this.currentChannelIds);
      this.overlayWs.connect({
        port: this.widget!.port,
        widgetId: this.widget!.id,
        filter: this.currentFilter,
        channelIds: channelIds,
        preserveMessages: true,
        maxMessages: this.maxMessages(),
      });
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.configPollInterval) {
      clearInterval(this.configPollInterval);
    }

    window.removeEventListener(
      "unichat-overlay-config-changed",
      this.onOverlayConfigChangedHandler
    );
  }

  async startBackendConfigPolling(widgetId: string): Promise<void> {
    await this.pollBackendConfig(widgetId);

    this.configPollInterval = setInterval(async () => {
      await this.pollBackendConfig(widgetId);
    }, 2000);
  }

  private async pollBackendConfig(widgetId: string): Promise<void> {
    try {
      let config: WidgetConfig | null = null;
      try {
        config = await this.tauriApi.invoke<WidgetConfig>("getOverlayConfig", { widgetId });
      } catch (tauriError) {
        try {
          const port = this.widget?.port || 1450;
          const response = await fetch(
            `http://127.0.0.1:${port}/api/overlay/${encodeURIComponent(widgetId)}/config`
          );
          if (response.ok) {
            config = await response.json();
          }
        } catch (httpError) {
          this.logger.debug("HTTP fallback unavailable for pollBackendConfig", {
            tauriError,
            httpError,
          });
        }
      }

      if (!config) {
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

        this.currentFilter = currentFilter as WidgetFilter;
        this.currentChannelIds = currentChannels;
        this.customCssText.set(currentCss);
        this.textSize.set(currentTextSize);
        this.animationType.set(currentAnimationType as OverlayAnimationType);
        this.animationDirection.set(currentAnimationDirection as OverlayDirection);
        this.maxMessages.set(currentMaxMessages);
        this.transparentBg.set(currentTransparentBg);

        if (hasFilterOrChannelsChanged) {
          const channelIds = this.extractChannelIdsFromSelection(this.currentChannelIds);
          this.overlayWs.connect({
            port: this.widget!.port,
            widgetId: this.widget!.id,
            filter: this.currentFilter,
            channelIds: channelIds,
            preserveMessages: true,
            maxMessages: this.maxMessages(),
          });

          await this.pollBackendMessages(widgetId, currentChannels);
        }

        this.cdr.markForCheck();
      }
    } catch (pollError) {
      this.logger.warn("Backend config poll failed", { error: pollError });
    }
  }

  async pollBackendMessages(widgetId: string, channelIds: string[] | undefined): Promise<void> {
    try {
      const messages = await this.tauriApi.invoke<OverlayChatMessage[]>(
        "getOverlayMessages",
        {
          widgetId,
          limit: this.maxMessages(),
          channelIds,
        },
        { suppressError: true }
      );

      if (messages.length > 0) {
        for (const message of messages) {
          this.overlayWs.addMessage(message);
        }
      }
    } catch (e) {
      // Silently fail
    }
  }

  private extractChannelIdsFromSelection(channelIds: string[] | undefined): string[] | undefined {
    if (channelIds === undefined) {
      return undefined;
    }
    return [...channelIds].sort();
  }

  private canonicalizeChannelRefs(channelRefs: string[] | undefined): string | null {
    if (!channelRefs || channelRefs.length === 0) {
      return null;
    }
    return [...channelRefs].sort().join("|");
  }

  getAnimationCss(): string {
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
}
