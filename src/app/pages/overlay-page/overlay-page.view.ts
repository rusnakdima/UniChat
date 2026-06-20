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
import { DensityMode, PlatformType, WidgetConfig } from "@entities/chat.model";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { ChatListService } from "@services/data/chat-list.service";
import { OverlayChatMessage, OverlayWsStateService } from "@services/ui/overlay-ws-state.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { OverlayConfigManager } from "./overlay-config.manager";
import { OverlayChatRenderer } from "./overlay-chat.renderer";
import { migrateLegacyChannelRefs } from "@utils/channel-ref.util";
import { OverlayStorageService } from "@app/shared/services/overlay-storage.service";

@Component({
  selector: "app-overlay-view",
  standalone: true,
  imports: [NgStyle, MatIconModule, MatTooltipModule],
  templateUrl: "./overlay-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "block h-full min-h-0",
  },
})
export class OverlayView implements OnDestroy {
  readonly dashboardState = inject(DashboardStateService);
  readonly overlayWs = inject(OverlayWsStateService);
  readonly chatList = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly overlayStorage = inject(OverlayStorageService);

  readonly configManager = new OverlayConfigManager();
  readonly chatRenderer = new OverlayChatRenderer();

  readonly customCssText = computed(() => this.configManager.customCssText());
  readonly textSize = computed(() => this.configManager.textSize());
  readonly animationType = computed(() => this.configManager.animationType());
  readonly animationDirection = computed(() => this.configManager.animationDirection());
  readonly maxMessages = computed(() => this.configManager.maxMessages());
  readonly transparentBg = computed(() => this.configManager.transparentBg());

  readonly animationCssText = computed(() => this.configManager.animationCssText());

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

    this.configManager.initialize(widget);
    this.chatRenderer.setCurrentChannelIds(this.configManager.getCurrentChannelIds());

    void this.configManager.initializeOverlayRuntime(widget);

    effect(() => {
      const messages = this.overlayWs.messages();
      const changed = this.chatRenderer.ensureAvatarCachesForMessages(messages);
      if (changed) {
        this.cdr.markForCheck();
      }
    });

    this.configManager.startBackendConfigPolling(widget.id);
  }

  ngOnDestroy(): void {
    this.configManager.ngOnDestroy();
  }

  platformLabel(platform: PlatformType): string {
    return this.chatRenderer.platformLabel(platform);
  }

  platformBadgeClasses(platform: PlatformType): string {
    return this.chatRenderer.platformBadgeClasses(platform);
  }

  densityTextClasses(densityMode: DensityMode): string {
    return this.chatRenderer.densityTextClasses(densityMode);
  }

  hasMultipleChannels(): boolean {
    return this.chatRenderer.hasMultipleChannels();
  }

  shouldShowPlatformIcon(message: OverlayChatMessage): boolean {
    return this.chatRenderer.shouldShowPlatformIcon(message);
  }

  shouldShowChannelImage(message: OverlayChatMessage): boolean {
    return this.chatRenderer.shouldShowChannelImage(message);
  }

  shouldShowUserImage(message: OverlayChatMessage): boolean {
    return this.chatRenderer.shouldShowUserImage(message);
  }

  shouldShowAuthorInitial(message: OverlayChatMessage): boolean {
    return this.chatRenderer.shouldShowAuthorInitial(message);
  }

  channelInitial(message: OverlayChatMessage): string {
    return this.chatRenderer.channelInitial(message);
  }

  authorInitial(message: OverlayChatMessage): string {
    return this.chatRenderer.authorInitial(message);
  }

  shouldShowPlatformContextIcon(): boolean {
    return this.chatRenderer.shouldShowPlatformContextIcon();
  }

  isEmoteUrlBroken(url: string | undefined | null): boolean {
    return this.chatRenderer.isEmoteUrlBroken(url);
  }

  onEmoteImageError(url: string | undefined | null): void {
    this.chatRenderer.onEmoteImageError(url);
  }

  getChannelImageUrl(message: OverlayChatMessage): string | null {
    return this.chatRenderer.getChannelImageUrl(message);
  }

  getUserImageUrl(message: OverlayChatMessage): string | null {
    return this.chatRenderer.getUserImageUrl(message);
  }

  channelTitle(message: OverlayChatMessage): string {
    return this.chatRenderer.channelTitle(message);
  }

  messageTimeLabel(message: OverlayChatMessage): string {
    return this.chatRenderer.messageTimeLabel(message);
  }

  overlayMessages(): OverlayChatMessage[] {
    return this.chatRenderer.overlayMessages(this.overlayWs.messages());
  }

  orderedMessages(): OverlayChatMessage[] {
    return this.chatRenderer.orderedMessages(this.overlayMessages());
  }

  animationCss(): string {
    return this.configManager.getAnimationCss();
  }

  getMessageSegments(
    message: OverlayChatMessage
  ): ReturnType<OverlayChatRenderer["getMessageSegments"]> {
    return this.chatRenderer.getMessageSegments(message);
  }

  messagesContainerClasses(): string {
    return this.chatRenderer.messagesContainerClasses();
  }

  widgetSummary(): string {
    const widget = this.activeWidget;
    if (!widget) {
      return "Widget preview unavailable";
    }

    const effectiveFilter =
      this.overlayStorage.readOverlayFilterOverride(widget.id) ?? widget.filter;
    const channelIds = migrateLegacyChannelRefs(
      this.overlayStorage.readOverlayChannelIds(widget.id) ?? widget.channelIds,
      this.chatList.getVisibleChannels()
    );
    const channelCount = channelIds?.length ?? 0;
    const channelLabel = channelCount > 0 ? `${channelCount} channel(s)` : "all channels";
    const filterLabel = effectiveFilter === "all" ? "All chat" : "Supporters only";
    return `${filterLabel} • ${channelLabel} • ${this.overlayWs.messages().length} queued`;
  }

  messageFullTimeLabel(message: OverlayChatMessage): string {
    return this.chatRenderer.messageFullTimeLabel(message);
  }
}
