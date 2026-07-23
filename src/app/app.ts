import { Component, inject, signal, OnInit } from "@angular/core";
import { SchemaShellComponent } from "@tauri-front/shared";
import { AuthorizationService } from "@services/features/authorization.service";
import { ConnectionManagerService } from "@services/core/connection-manager.service";
import { MemoryManagementService } from "@services/core/memory-management.service";
import { ChannelImagePreloaderService } from "@services/ui/channel-image-preloader.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [SchemaShellComponent],
  templateUrl: "./app.html",
})
export class AppComponent implements OnInit {
  private readonly memoryService = inject(MemoryManagementService);
  private readonly channelImagePreloader = inject(ChannelImagePreloaderService);
  private readonly authService = inject(AuthorizationService);
  private readonly connectionManager = inject(ConnectionManagerService);

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

  ngOnInit(): void {
    this.memoryService.startAutoPrune(60000);
    this.authService.startAutoRefresh();
    void this.authService.loadAllAccountStatuses();
    void this.channelImagePreloader.preloadAllVisibleChannels();
  }
}
