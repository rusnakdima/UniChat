import { Injectable, inject, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { LoggingService } from "@app/shared/services/logging.service";

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  download_url: string;
  asset_name: string;
  asset_size: number;
  release_notes: string | null;
}

export interface CheckUpdateResult {
  has_update: boolean;
  update_info: UpdateInfo | null;
  error: string | null;
}

export interface DownloadProgress {
  bytes_downloaded: number;
  total_bytes: number;
  progress_percent: number;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "update-available"
  | "up-to-date"
  | "downloading"
  | "ready-to-install"
  | "installing"
  | "error";

@Injectable({
  providedIn: "root",
})
export class UpdateService {
  private readonly logging = inject(LoggingService);
  private readonly currentVersion = signal<string>("");
  private readonly latestVersion = signal<string>("");
  private readonly status = signal<UpdateStatus>("idle");
  private readonly downloadProgress = signal<number>(0);
  private readonly errorMessage = signal<string | null>(null);
  private readonly downloadPath = signal<string | null>(null);

  private unlistenProgress: UnlistenFn | null = null;
  private unlistenComplete: UnlistenFn | null = null;

  async initialize(): Promise<void> {
    try {
      const version = await invoke<string>("getCurrentVersion");
      this.currentVersion.set(version);
    } catch (e) {
      this.logging.error("UpdateService", "Failed to get current version:", e);
    }
  }

  async checkForUpdate(): Promise<CheckUpdateResult> {
    this.status.set("checking");
    this.errorMessage.set(null);

    try {
      const result = await invoke<CheckUpdateResult>("checkForUpdate");

      if (result.error) {
        this.status.set("error");
        this.errorMessage.set(result.error);
        return result;
      }

      if (result.has_update && result.update_info) {
        this.latestVersion.set(result.update_info.latest_version);
        this.status.set("update-available");
      } else {
        this.status.set("up-to-date");
      }

      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.status.set("error");
      this.errorMessage.set(errorMsg);
      return {
        has_update: false,
        update_info: null,
        error: errorMsg,
      };
    }
  }

  async downloadUpdate(): Promise<void> {
    const result = await this.checkForUpdate();
    if (!result.has_update || !result.update_info) {
      return;
    }

    this.status.set("downloading");
    this.downloadProgress.set(0);

    this.unlistenProgress = await listen<DownloadProgress>("update-download-progress", (event) => {
      this.downloadProgress.set(Math.round(event.payload.progress_percent));
    });

    this.unlistenComplete = await listen<string>("update-download-complete", (event) => {
      this.downloadPath.set(event.payload);
      this.status.set("ready-to-install");
      this.cleanupListeners();
    });

    try {
      const path = await invoke<string>("downloadUpdate", {
        url: result.update_info.download_url,
      });
      this.downloadPath.set(path);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.status.set("error");
      this.errorMessage.set(errorMsg);
      this.cleanupListeners();
    }
  }

  async installUpdate(): Promise<void> {
    const path = this.downloadPath();
    if (!path) {
      this.errorMessage.set("No update file path available");
      this.status.set("error");
      return;
    }

    this.status.set("installing");

    try {
      await invoke<boolean>("installUpdate", { installerPath: path });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.status.set("error");
      this.errorMessage.set(errorMsg);
    }
  }

  private cleanupListeners(): void {
    if (this.unlistenProgress) {
      this.unlistenProgress();
      this.unlistenProgress = null;
    }
    if (this.unlistenComplete) {
      this.unlistenComplete();
      this.unlistenComplete = null;
    }
  }

  getCurrentVersion(): string {
    return this.currentVersion();
  }

  getLatestVersion(): string {
    return this.latestVersion();
  }

  getStatus(): UpdateStatus {
    return this.status();
  }

  getDownloadProgress(): number {
    return this.downloadProgress();
  }

  getErrorMessage(): string | null {
    return this.errorMessage();
  }

  resetStatus(): void {
    this.status.set("idle");
    this.errorMessage.set(null);
    this.downloadProgress.set(0);
    this.downloadPath.set(null);
  }
}
