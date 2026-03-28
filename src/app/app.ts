/* sys lib */
import { Component, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";

/* services */
import { ThemeService } from "@services/core/theme.service";
import { MemoryManagementService } from "@services/core/memory-management.service";

/* components */
import { LinkPreviewModal } from "@components/link-preview-modal/link-preview-modal";
@Component({
  selector: "app-root",
  imports: [RouterOutlet, LinkPreviewModal],
  templateUrl: "./app.html",
})
export class App {
  private readonly themeService = inject(ThemeService);
  private readonly memoryService = inject(MemoryManagementService);

  constructor() {
    this.themeService.hydrateTheme();
    this.memoryService.startAutoPrune();
  }
}
