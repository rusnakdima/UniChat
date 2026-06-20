import { Injectable, signal, computed, inject } from "@angular/core";
import { PlatformType } from "@entities/chat.model";
import { TauriApiService } from "@app/api/api.api.service";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface PlatformAccount {
  id: string;
  platform: PlatformType;
  username: string;
  userId: string;
  avatarUrl: string;
  isConnected: boolean;
  authStatus?: string;
  accessToken?: string;
  authorizedAt?: string;
}

@Injectable({ providedIn: "root" })
export class AuthorizationService {
  private readonly api = inject(TauriApiService);
  private _accounts = signal<PlatformAccount[]>([]);
  private _autoRefreshEnabled = false;
  readonly accounts = computed(() => this._accounts());

  isAuthorized(_action: string): boolean {
    return true;
  }
  canModerate(): boolean {
    return false;
  }
  deauthorizeAccount(accountId: string, _platform?: PlatformType): void {
    this._accounts.update((accounts) =>
      accounts.map((a) => (a.id === accountId ? { ...a, isConnected: false } : a))
    );
  }
  deauthorize(accountId: string): void {
    this.deauthorizeAccount(accountId);
  }
  async authorize(platform: PlatformType): Promise<void> {
    try {
      const result = (await this.api.authStart({ platform })) as { auth_url?: string };
      if (result?.auth_url) {
        await openUrl(result.auth_url);
        await this.api.authAwaitCallback({ platform });
        await this.loadAccountStatus(platform);
      }
    } catch (error) {
      console.error("Authorization failed:", error);
    }
  }
  private async loadAccountStatus(platform: PlatformType): Promise<void> {
    try {
      const result = (await this.api.authStatus({ platform })) as { accounts?: PlatformAccount[] };
      if (result?.accounts) {
        this._accounts.update((current) => {
          const others = current.filter((a) => a.platform !== platform);
          return [...others, ...result.accounts!];
        });
      }
    } catch (error) {
      console.error("Failed to load account status:", error);
    }
  }
  startAutoRefresh(): void {
    this._autoRefreshEnabled = true;
  }
  getAccountByIdSync(accountId: string): PlatformAccount | undefined {
    return this._accounts().find((a) => a.id === accountId);
  }
  getPrimaryAccount(platform: string): PlatformAccount | undefined {
    return this._accounts().find((a) => a.platform === platform);
  }
}
