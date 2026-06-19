/* sys lib */
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { RouterOutlet } from "@angular/router";

/* services */
import { ThemeService } from "@services/core/theme.service";
import { MemoryManagementService } from "@services/core/memory-management.service";
import { ChannelImagePreloaderService } from "@services/ui/channel-image-preloader.service";
import { AuthorizationService } from "@services/features/authorization.service";

/* components */
import { LinkPreviewModal } from "@components/link-preview-modal/link-preview-modal.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, LinkPreviewModal],
  templateUrl: "./app.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly themeService = inject(ThemeService);
  private readonly memoryService = inject(MemoryManagementService);
  private readonly channelImagePreloader = inject(ChannelImagePreloaderService);
  private readonly authService = inject(AuthorizationService);

  readonly isOverlay = signal<boolean>(this.checkIsOverlay());

  private checkIsOverlay(): boolean {
    if (typeof window === "undefined") {
      return false;
    }
    // Check both pathname and query params for overlay context
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const widgetId = searchParams.get("widgetId");

    // Overlay routes: /overlay or /overlay-management
    return pathname === "/overlay" || pathname === "/overlay-management" || !!widgetId;
  }

  constructor() {
    this.themeService.hydrateTheme();
    this.memoryService.startAutoPrune(60000);
    this.authService.startAutoRefresh();
    // Preload channel images in background (non-blocking)
    void this.channelImagePreloader.preloadAllVisibleChannels();
  }
}
