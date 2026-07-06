/* sys lib */
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { SchemaRouterService, SchemaRouteViewerComponent } from "@tauri-front/shared";

/* services */
import { ThemeService } from "@services/core/theme.service";
import { MemoryManagementService } from "@services/core/memory-management.service";
import { ChannelImagePreloaderService } from "@services/ui/channel-image-preloader.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ConnectionManagerService } from "@services/core/connection-manager.service";
import { SchemaService } from "@services/core/schema.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [SchemaRouteViewerComponent],
  templateUrl: "./app.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly themeService = inject(ThemeService);
  private readonly memoryService = inject(MemoryManagementService);
  private readonly channelImagePreloader = inject(ChannelImagePreloaderService);
  private readonly authService = inject(AuthorizationService);
  private readonly connectionManager = inject(ConnectionManagerService);
  private readonly schemaService = inject(SchemaService);
  private readonly schemaRouter = inject(SchemaRouterService);

  readonly isOverlay = signal<boolean>(this.checkIsOverlay());

  private checkIsOverlay(): boolean {
    if (typeof window === "undefined") {
      return false;
    }
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const widgetId = searchParams.get("widgetId");

    return pathname === "/overlay" || pathname === "/overlay-management" || !!widgetId;
  }

  constructor() {
    this.themeService.hydrateTheme();
    this.memoryService.startAutoPrune(60000);
    this.authService.startAutoRefresh();
    void this.authService.loadAllAccountStatuses();
    void this.channelImagePreloader.preloadAllVisibleChannels();
    void this.schemaService.loadSchema().then((loaded) => {
      if (loaded) {
        void this.schemaRouter.navigate("/dashboard");
      }
    });
  }
}
