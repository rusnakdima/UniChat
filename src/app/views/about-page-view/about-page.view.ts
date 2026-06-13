import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { UpdateService } from "@services/features/update.service";
import { ThemeService } from "@services/core/theme.service";
import { GITHUB_RELEASES_URL } from "@config/app.constants";

@Component({
  selector: "app-about-page-view",
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: "./about-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPageView implements OnInit {
  private readonly updateService = inject(UpdateService);
  readonly themeService = inject(ThemeService);

  readonly themeMode = this.themeService.themeMode;
  currentVersion = signal("");

  readonly changelogUrl = GITHUB_RELEASES_URL;

  ngOnInit(): void {
    this.currentVersion.set(this.updateService.getCurrentVersion());
  }

  openChangelog(): void {
    window.open(this.changelogUrl, "_blank");
  }
}
