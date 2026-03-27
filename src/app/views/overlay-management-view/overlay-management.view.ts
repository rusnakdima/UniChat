import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute } from "@angular/router";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import {
  WidgetConfig,
  WidgetFilter,
  OverlayAnimationType,
  OverlayDirection,
} from "@models/chat.model";
import { invoke } from "@tauri-apps/api/core";

function overlayFilterOverrideKey(widgetId: string): string {
  return `unichat-overlay-filter-override:${widgetId}`;
}

function overlayCustomCssKey(widgetId: string): string {
  return `unichat-overlay-custom-css:${widgetId}`;
}

function overlayChannelIdsKey(widgetId: string): string {
  return `unichat-overlay-channel-ids:${widgetId}`;
}

function overlayMaxMessagesKey(widgetId: string): string {
  return `unichat-overlay-max-messages:${widgetId}`;
}

function overlayTextSizeKey(widgetId: string): string {
  return `unichat-overlay-text-size:${widgetId}`;
}

function overlayAnimationTypeKey(widgetId: string): string {
  return `unichat-overlay-animation-type:${widgetId}`;
}

function overlayAnimationDirectionKey(widgetId: string): string {
  return `unichat-overlay-animation-direction:${widgetId}`;
}

function overlayTransparentBgKey(widgetId: string): string {
  return `unichat-overlay-transparent-bg:${widgetId}`;
}

@Component({
  selector: "app-overlay-management-view",
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: "./overlay-management.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverlayManagementView {
  private readonly route = inject(ActivatedRoute);
  private readonly dashboardState = inject(DashboardStateService);
  private readonly chatList = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);

  readonly saveSuccess = signal<boolean>(false);

  readonly widget: WidgetConfig | null = (() => {
    const widgetId = this.route.snapshot.queryParamMap.get("widgetId");
    if (widgetId) {
      return (
        this.dashboardState.widgets().find((w) => w.id === widgetId) ??
        this.dashboardState.featuredWidget()
      );
    }
    return this.dashboardState.featuredWidget();
  })();

  readonly overlayUrl = (() => {
    const w = this.widget;
    if (!w) {
      return "";
    }
    return `http://127.0.0.1:${w.port}/overlay?widgetId=${w.id}`;
  })();

  readonly filterModel = signal<WidgetFilter>("all");
  readonly customCssModel = signal<string>("");
  readonly channelIdsModel = signal<string[]>([]);
  readonly maxMessagesModel = signal<number>(6);
  readonly textSizeModel = signal<number>(16);
  readonly animationTypeModel = signal<OverlayAnimationType>("fade");
  readonly animationDirectionModel = signal<OverlayDirection>("top");
  readonly transparentBgModel = signal<boolean>(false);
  readonly opacityModel = signal<number>(1.0);

  readonly availableChannels = computed(() => this.chatList.getVisibleChannels());

  constructor() {
    const w = this.widget;
    if (!w) {
      return;
    }

    const overrideFilter = this.readOverlayFilterOverride(w.id);
    this.filterModel.set(overrideFilter ?? w.filter);

    this.customCssModel.set(localStorage.getItem(overlayCustomCssKey(w.id)) ?? "");

    // Load channel selection from localStorage or widget config
    const storedChannelIds = this.readOverlayChannelIds(w.id);
    this.channelIdsModel.set(storedChannelIds ?? w.channelIds ?? []);

    // Load overlay appearance settings
    this.maxMessagesModel.set(this.readOverlayMaxMessages(w.id) ?? 6);
    this.textSizeModel.set(this.readOverlayTextSize(w.id) ?? 16);
    this.animationTypeModel.set(this.readOverlayAnimationType(w.id) ?? "fade");
    this.animationDirectionModel.set(this.readOverlayAnimationDirection(w.id) ?? "top");
    this.transparentBgModel.set(this.readOverlayTransparentBg(w.id) ?? false);
    this.opacityModel.set(readOverlayOpacity(w.id) ?? 1.0);

    // Ensure overlay server is started so OBS can load the URL immediately.
    void invoke("startOverlayServer", { port: w.port }).catch(() => {});
  }

  private readOverlayFilterOverride(widgetId: string): WidgetFilter | null {
    const raw = localStorage.getItem(overlayFilterOverrideKey(widgetId));
    if (raw === "all" || raw === "supporters") {
      return raw;
    }
    return null;
  }

  private readOverlayChannelIds(widgetId: string): string[] | null {
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

  private readOverlayMaxMessages(widgetId: string): number | null {
    const raw = localStorage.getItem(overlayMaxMessagesKey(widgetId));
    if (raw) {
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private readOverlayTextSize(widgetId: string): number | null {
    const raw = localStorage.getItem(overlayTextSizeKey(widgetId));
    if (raw) {
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private readOverlayAnimationType(widgetId: string): OverlayAnimationType | null {
    const raw = localStorage.getItem(overlayAnimationTypeKey(widgetId));
    if (raw === "none" || raw === "fade" || raw === "slide" || raw === "pop") {
      return raw;
    }
    return null;
  }

  private readOverlayAnimationDirection(widgetId: string): OverlayDirection | null {
    const raw = localStorage.getItem(overlayAnimationDirectionKey(widgetId));
    if (raw === "top" || raw === "bottom" || raw === "left" || raw === "right") {
      return raw;
    }
    return null;
  }

  private readOverlayTransparentBg(widgetId: string): boolean | null {
    const raw = localStorage.getItem(overlayTransparentBgKey(widgetId));
    if (raw === "true" || raw === "false") {
      return raw === "true";
    }
    return null;
  }

  async copyOverlayUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.overlayUrl);
    } catch {
      // Fallback: best-effort prompt.
      window.prompt("Copy overlay URL:", this.overlayUrl);
    }
  }

  openPreviewPopup(): void {
    const w = this.widget;
    if (!w) {
      return;
    }

    // Use Tauri command to open overlay in native window
    invoke("openOverlayWindow", {
      port: w.port,
      widgetId: w.id,
      transparentBg: this.transparentBgModel(),
      opacity: this.opacityModel(),
    }).catch((err) => {
      console.error("[Overlay] Failed to open preview window:", err);
    });
  }

  saveConfig(): void {
    const w = this.widget;
    if (!w) {
      return;
    }

    localStorage.setItem(overlayFilterOverrideKey(w.id), this.filterModel());
    localStorage.setItem(overlayCustomCssKey(w.id), this.customCssModel());
    localStorage.setItem(overlayChannelIdsKey(w.id), JSON.stringify(this.channelIdsModel()));
    localStorage.setItem(overlayMaxMessagesKey(w.id), this.maxMessagesModel().toString());
    localStorage.setItem(overlayTextSizeKey(w.id), this.textSizeModel().toString());
    localStorage.setItem(overlayAnimationTypeKey(w.id), this.animationTypeModel());
    localStorage.setItem(overlayAnimationDirectionKey(w.id), this.animationDirectionModel());
    localStorage.setItem(overlayTransparentBgKey(w.id), this.transparentBgModel().toString());
    localStorage.setItem(overlayOpacityKey(w.id), this.opacityModel().toString());

    // Same-window updates (overlay view already listens for this).
    window.dispatchEvent(new Event("unichat-overlay-config-changed"));

    // Store config in backend and emit event to all windows
    invoke("emitOverlayConfigChanged", {
      widgetId: w.id,
      timestamp: Date.now(),
      filter: this.filterModel(),
      customCss: this.customCssModel(),
      channelIds: this.channelIdsModel(),
      textSize: this.textSizeModel(),
      animationType: this.animationTypeModel(),
      animationDirection: this.animationDirectionModel(),
      maxMessages: this.maxMessagesModel(),
      transparentBg: this.transparentBgModel(),
      opacity: this.opacityModel(),
    }).catch((err) => {
      console.error("[OverlayManagement] Failed to send config to backend:", err);
    });

    // Show visual confirmation
    this.saveSuccess.set(true);
    setTimeout(() => this.saveSuccess.set(false), 3000);
  }

  get selectedFilter(): WidgetFilter {
    return this.filterModel();
  }

  set selectedFilter(value: WidgetFilter) {
    this.filterModel.set(value);
  }

  get customCssText(): string {
    return this.customCssModel();
  }

  set customCssText(value: string) {
    this.customCssModel.set(value);
  }

  get selectedChannelIds(): string[] {
    return this.channelIdsModel();
  }

  set selectedChannelIds(value: string[]) {
    this.channelIdsModel.set(value);
  }

  get maxMessages(): number {
    return this.maxMessagesModel();
  }

  set maxMessages(value: number) {
    this.maxMessagesModel.set(value);
  }

  get textSize(): number {
    return this.textSizeModel();
  }

  set textSize(value: number) {
    this.textSizeModel.set(value);
  }

  get animationType(): OverlayAnimationType {
    return this.animationTypeModel();
  }

  set animationType(value: OverlayAnimationType) {
    this.animationTypeModel.set(value);
  }

  get animationDirection(): OverlayDirection {
    return this.animationDirectionModel();
  }

  set animationDirection(value: OverlayDirection) {
    this.animationDirectionModel.set(value);
  }

  get transparentBg(): boolean {
    return this.transparentBgModel();
  }

  set transparentBg(value: boolean) {
    this.transparentBgModel.set(value);
  }

  get opacity(): number {
    return this.opacityModel();
  }

  set opacity(value: number) {
    this.opacityModel.set(value);
  }

  toggleChannel(platform: string, channelName: string): void {
    const compositeKey = `${platform}:${channelName}`;
    const current = this.channelIdsModel();
    const index = current.indexOf(compositeKey);
    if (index === -1) {
      this.channelIdsModel.set([...current, compositeKey]);
    } else {
      this.channelIdsModel.set(current.filter((key) => key !== compositeKey));
    }
    // Auto-save removed - user must click Save button
  }

  isChannelSelected(platform: string, channelName: string): boolean {
    const compositeKey = `${platform}:${channelName}`;
    return this.channelIdsModel().includes(compositeKey);
  }

  selectAllChannels(): void {
    this.channelIdsModel.set(
      this.availableChannels().map((ch) => `${ch.platform}:${ch.channelName}`)
    );
    // Auto-save removed - user must click Save button
  }

  clearChannelSelection(): void {
    this.channelIdsModel.set([]);
    // Auto-save removed - user must click Save button
  }

  getChannelDisplayName(channelId: string): string {
    const channel = this.availableChannels().find((ch) => ch.id === channelId);
    return channel ? `${channel.channelName} (${channel.platform})` : channelId;
  }
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
