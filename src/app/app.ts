/* sys lib */
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";

/* services */
import { ThemeService } from "@services/core/theme.service";
import { MemoryManagementService } from "@services/core/memory-management.service";

/* components */
import { LinkPreviewModal } from "@components/link-preview-modal/link-preview-modal";

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

  constructor() {
    this.themeService.hydrateTheme();
    this.memoryService.startAutoPrune();
  }
}
