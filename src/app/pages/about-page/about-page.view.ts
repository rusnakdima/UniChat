import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { UpdateService } from "@services/features/update.service";
import { ThemeService } from "@services/core/theme.service";
import { GITHUB_RELEASES_URL } from "@shared/utils/constants";

@Component({
  selector: "app-about-page-view",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: "./about-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPageView implements OnInit, OnDestroy {
  private readonly updateService = inject(UpdateService);
  readonly themeService = inject(ThemeService);

  readonly themeMode = this.themeService.themeMode;
  currentVersion = signal("");
  latestVersion = signal("");
  status = signal<string>("idle");
  downloadProgress = signal(0);
  errorMessage = signal<string | null>(null);

  readonly changelogUrl = GITHUB_RELEASES_URL;

  ngOnInit(): void {
    void this.updateService.initialize();
    this.currentVersion.set(this.updateService.getCurrentVersion());
  }

  ngOnDestroy(): void {
    this.updateService.resetStatus();
  }

  openChangelog(): void {
    window.open(this.changelogUrl, "_blank");
  }

  async checkForUpdate(): Promise<void> {
    this.errorMessage.set(null);
    const result = await this.updateService.checkForUpdates();

    if (!result) {
      this.latestVersion.set(this.currentVersion());
      this.status.set("up-to-date");
      return;
    }

    this.latestVersion.set(result.version);
    this.status.set("update-available");
  }

  async downloadAndInstall(): Promise<void> {
    this.errorMessage.set(null);
    this.status.set("downloading");

    await this.updateService.downloadUpdate();

    const serviceStatus = this.updateService.getStatus();
    this.downloadProgress.set(this.updateService.getDownloadProgress());

    if (serviceStatus.state === "ready") {
      this.status.set("ready-to-install");
    } else if (serviceStatus.state === "idle" && this.updateService.getErrorMessage()) {
      this.errorMessage.set(this.updateService.getErrorMessage());
      this.status.set("error");
    }
  }

  async installUpdate(): Promise<void> {
    this.errorMessage.set(null);
    this.status.set("installing");
    this.updateService.installUpdate();

    const serviceStatus = this.updateService.getStatus();
    if (serviceStatus.state === "idle" && this.updateService.getErrorMessage()) {
      this.errorMessage.set(this.updateService.getErrorMessage());
      this.status.set("error");
    }
  }

  resetAndCheck(): void {
    this.updateService.resetStatus();
    this.downloadProgress.set(0);
    this.status.set("idle");
    this.errorMessage.set(null);
    void this.checkForUpdate();
  }

  isChecking(): boolean {
    return this.status() === "checking";
  }

  isUpdateAvailable(): boolean {
    return this.status() === "update-available";
  }

  isUpToDate(): boolean {
    return this.status() === "up-to-date";
  }

  isDownloading(): boolean {
    return this.status() === "downloading";
  }

  isReadyToInstall(): boolean {
    return this.status() === "ready-to-install";
  }

  isInstalling(): boolean {
    return this.status() === "installing";
  }

  isError(): boolean {
    return this.status() === "error" || this.errorMessage() !== null;
  }

  isIdle(): boolean {
    return this.status() === "idle";
  }
}
