/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ActivatedRoute } from "@angular/router";
import { invoke } from "@tauri-apps/api/core";

/* models */
import {
  WidgetConfig,
  WidgetFilter,
  OverlayAnimationType,
  OverlayDirection,
} from "@models/chat.model";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardStateService } from "@services/features/dashboard-state.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChannelAvatarService } from "@services/ui/channel-avatar.service";
import { findChannelByRef, migrateLegacyChannelRefs, toChannelRef } from "@utils/channel-ref.util";

/* components */
import { CheckboxComponent } from "@components/ui/checkbox/checkbox.component";
import { SharedHeaderComponent } from "@components/shared-header/shared-header.component";
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
  imports: [FormsModule, MatIconModule, CheckboxComponent, SharedHeaderComponent],
  templateUrl: "./overlay-management.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverlayManagementView {
  private readonly route = inject(ActivatedRoute);
  private readonly dashboardState = inject(DashboardStateService);
  private readonly chatList = inject(ChatListService);
  private readonly localStorageService = inject(LocalStorageService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly channelAvatars = inject(ChannelAvatarService);

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
  readonly channelIdsModel = signal<string[] | undefined>(undefined);
  readonly maxMessagesModel = signal<number>(6);
  readonly textSizeModel = signal<number>(16);
  readonly animationTypeModel = signal<OverlayAnimationType>("fade");
  readonly animationDirectionModel = signal<OverlayDirection>("top");
  readonly transparentBgModel = signal<boolean>(false);

  readonly availableChannels = computed(() =>
    this.chatList.channels().filter((ch) => ch.isVisible)
  );

  constructor() {
    effect(() => {
      for (const channel of this.availableChannels()) {
        this.channelAvatars.ensureChannelImageForChannel(channel);
      }
    });

    const w = this.widget;
    if (!w) {
      return;
    }

    const overrideFilter = this.readOverlayFilterOverride(w.id);
    this.filterModel.set(overrideFilter ?? w.filter);

    this.customCssModel.set(this.localStorageService.get(overlayCustomCssKey(w.id), ""));

    const storedChannelIds = this.readOverlayChannelIds(w.id);
    let channelIdsToUse = migrateLegacyChannelRefs(
      storedChannelIds ?? w.channelIds,
      this.availableChannels()
    );

    // Convert undefined to explicit array of all visible channels
    // Overlay is independent - user manually selects which channels to show
    if (channelIdsToUse === undefined) {
      channelIdsToUse = []; // Start with no channels selected - user must manually enable
    }

    // Overlay only shows channels that are visible in settings (isVisible === true)
    // No filtering by dashboard state - overlay is independent
    this.channelIdsModel.set(channelIdsToUse);

    // Load overlay appearance settings
    this.maxMessagesModel.set(this.readOverlayMaxMessages(w.id) ?? 6);
    this.textSizeModel.set(this.readOverlayTextSize(w.id) ?? 16);
    this.animationTypeModel.set(this.readOverlayAnimationType(w.id) ?? "fade");
    this.animationDirectionModel.set(this.readOverlayAnimationDirection(w.id) ?? "top");
    this.transparentBgModel.set(this.readOverlayTransparentBg(w.id) ?? false);

    // Initialize backend config from localStorage (for overlay window to use)
    void this.initBackendConfigFromStorage(w.id);

    // Ensure overlay server is started so OBS can load the URL immediately.
    void invoke("startOverlayServer", { port: w.port }).catch((error) => {
      console.warn("[OverlayManagement] Failed to start overlay server:", error);
    });
  }

  private async initBackendConfigFromStorage(widgetId: string): Promise<void> {
    try {
      await invoke("initOverlayConfigFromStorage", {
        widgetId,
        filter: this.filterModel(),
        customCss: this.customCssModel(),
        channelIds: this.channelIdsModel() ?? null,
        textSize: this.textSizeModel(),
        animationType: this.animationTypeModel(),
        animationDirection: this.animationDirectionModel(),
        maxMessages: this.maxMessagesModel(),
        transparentBg: this.transparentBgModel(),
      });
    } catch {
      /* backend config init optional */
    }
  }

  private readOverlayFilterOverride(widgetId: string): WidgetFilter | null {
    const raw = this.localStorageService.get<string>(overlayFilterOverrideKey(widgetId), "");
    if (raw === "all" || raw === "supporters") {
      return raw;
    }
    return null;
  }

  private readOverlayChannelIds(widgetId: string): string[] | null {
    const stored = this.localStorageService.get<string[] | null>(
      overlayChannelIdsKey(widgetId),
      null
    );
    if (Array.isArray(stored)) {
      return stored;
    }
    return null;
  }

  private readOverlayMaxMessages(widgetId: string): number | null {
    const raw = this.localStorageService.get<string>(overlayMaxMessagesKey(widgetId), "");
    if (raw) {
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private readOverlayTextSize(widgetId: string): number | null {
    const raw = this.localStorageService.get<string>(overlayTextSizeKey(widgetId), "");
    if (raw) {
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private readOverlayAnimationType(widgetId: string): OverlayAnimationType | null {
    const raw = this.localStorageService.get<string>(overlayAnimationTypeKey(widgetId), "");
    if (raw === "none" || raw === "fade" || raw === "slide" || raw === "pop") {
      return raw;
    }
    return null;
  }

  private readOverlayAnimationDirection(widgetId: string): OverlayDirection | null {
    const raw = this.localStorageService.get<string>(overlayAnimationDirectionKey(widgetId), "");
    if (raw === "top" || raw === "bottom" || raw === "left" || raw === "right") {
      return raw;
    }
    return null;
  }

  private readOverlayTransparentBg(widgetId: string): boolean | null {
    const raw = this.localStorageService.get<string>(overlayTransparentBgKey(widgetId), "");
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
    }).catch(() => undefined);
  }

  saveConfig(): void {
    const w = this.widget;
    if (!w) {
      return;
    }

    this.localStorageService.set(overlayFilterOverrideKey(w.id), this.filterModel());
    this.localStorageService.set(overlayCustomCssKey(w.id), this.customCssModel());
    if (this.channelIdsModel() === undefined) {
      this.localStorageService.remove(overlayChannelIdsKey(w.id));
    } else {
      this.localStorageService.set(overlayChannelIdsKey(w.id), this.channelIdsModel());
    }
    this.localStorageService.set(overlayMaxMessagesKey(w.id), this.maxMessagesModel().toString());
    this.localStorageService.set(overlayTextSizeKey(w.id), this.textSizeModel().toString());
    this.localStorageService.set(overlayAnimationTypeKey(w.id), this.animationTypeModel());
    this.localStorageService.set(
      overlayAnimationDirectionKey(w.id),
      this.animationDirectionModel()
    );
    this.localStorageService.set(
      overlayTransparentBgKey(w.id),
      this.transparentBgModel().toString()
    );

    // Same-window updates (overlay view already listens for this).
    window.dispatchEvent(new Event("unichat-overlay-config-changed"));

    // Store config in backend and emit event to all windows
    invoke("emitOverlayConfigChanged", {
      widgetId: w.id,
      timestamp: Date.now(),
      filter: this.filterModel(),
      customCss: this.customCssModel(),
      channelIds: this.channelIdsModel() ?? null,
      textSize: this.textSizeModel(),
      animationType: this.animationTypeModel(),
      animationDirection: this.animationDirectionModel(),
      maxMessages: this.maxMessagesModel(),
      transparentBg: this.transparentBgModel(),
    }).catch(() => undefined);

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
    return this.channelIdsModel() ?? [];
  }

  set selectedChannelIds(value: string[]) {
    this.channelIdsModel.set(value.length > 0 ? value : undefined);
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

  toggleChannel(channelId: string): void {
    const channel = findChannelByRef(this.availableChannels(), channelId);

    // If channel is hidden in settings, don't allow toggling
    if (channel && !channel.isVisible) {
      return;
    }

    const current = this.channelIdsModel() ?? [];
    const index = current.indexOf(channelId);

    if (index === -1) {
      // Enabling channel in overlay: add to overlay selection only
      // Does NOT affect dashboard mixed disabled state
      if (!current.includes(channelId)) {
        this.channelIdsModel.set([...current, channelId]);
      }
    } else {
      // Disabling channel in overlay: remove from overlay selection only
      // Does NOT affect dashboard mixed disabled state
      this.channelIdsModel.set(current.filter((id) => id !== channelId));
    }
    // Auto-save removed - user must click Save button
  }

  isChannelSelected(channelId: string): boolean {
    const current = this.channelIdsModel();
    // undefined means "show all" — treat as all channels selected
    if (current === undefined) {
      return true;
    }
    return current.includes(channelId);
  }

  /** Check if a channel is disabled (hidden in settings) */
  isChannelDisabledBySettings(channelId: string): boolean {
    const channel = findChannelByRef(this.availableChannels(), channelId);
    return channel ? !channel.isVisible : false;
  }

  selectAllChannels(): void {
    // Select all visible channels in overlay only
    // Does NOT change dashboard mixed disabled state or settings visibility
    const enabledChannels = this.availableChannels().map((ch) => toChannelRef(ch));
    this.channelIdsModel.set(enabledChannels);
    // Auto-save removed - user must click Save button
  }

  clearChannelSelection(): void {
    // Only clear overlay selection, don't touch dashboard
    // User can still enable channels in dashboard independently
    this.channelIdsModel.set([]);
    // Auto-save removed - user must click Save button
  }

  getChannelDisplayName(channelId: string): string {
    const channel = findChannelByRef(this.availableChannels(), channelId);
    return channel ? `${channel.channelName} (${channel.platform})` : channelId;
  }

  channelSelectionValue(
    channel: ReturnType<ChatListService["getVisibleChannels"]>[number]
  ): string {
    return toChannelRef(channel);
  }
}
