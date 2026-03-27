import { Component, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { LinkPreviewModal } from "@components/link-preview-modal/link-preview-modal";
import { ThemeService } from "@services/core/theme.service";

@Component({
  selector: "app-root",
  imports: [RouterOutlet, LinkPreviewModal],
  templateUrl: "./app.html",
})
export class App {
  private readonly themeService = inject(ThemeService);

  constructor() {
    this.themeService.hydrateTheme();
  }
}
