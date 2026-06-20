import { Injectable, signal, computed, inject, effect } from "@angular/core";
import { PlatformType } from "@entities/chat.model";
import { TauriApiService } from "@app/api/api.api.service";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChatListService } from "@services/data/chat-list.service";

const ACCOUNTS_STORAGE_KEY = "unichat_accounts";

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
  private readonly chatList = inject(ChatListService);
  private _accounts = signal<PlatformAccount[]>(this.loadFromStorage());
  private _autoRefreshEnabled = false;
  readonly accounts = computed(() => this._accounts());

  constructor() {
    effect(() => {
      const accounts = this._accounts();
      this.saveToStorage(accounts);
    });
  }

  private loadFromStorage(): PlatformAccount[] {
    try {
      const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(accounts: PlatformAccount[]): void {
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (e) {
      console.error("[AUTH] Failed to save accounts to localStorage:", e);
    }
  }

  isAuthorized(_action: string): boolean {
    return true;
  }
  canModerate(): boolean {
    return false;
  }
  async deauthorizeAccount(accountId: string, platform?: PlatformType): Promise<void> {
    const account = this._accounts().find((a) => a.id === accountId);
    if (account) {
      try {
        await this.api.authDisconnect({ platform: account.platform, accountId });
      } catch (error) {
        console.error("[AUTH] Failed to disconnect account:", error);
      }
    }
    this._accounts.update((accounts) => accounts.filter((a) => a.id !== accountId));
  }
  deauthorize(accountId: string): void {
    this.deauthorizeAccount(accountId);
  }
  async authorize(platform: PlatformType): Promise<void> {
    console.log("[AUTH] authorize() called for platform:", platform);
    try {
      console.log("[AUTH] Calling authStart...");
      const result = (await this.api.authStart({ platform })) as {
        auth_url?: string;
        success?: boolean;
        authUrl?: string;
      };
      console.log("[AUTH] authStart result:", JSON.stringify(result));

      const authUrl = result?.auth_url || result?.authUrl;
      if (authUrl) {
        console.log("[AUTH] Opening URL:", authUrl);
        await openUrl(authUrl);
        console.log("[AUTH] URL opened, calling authAwaitCallback...");
        await this.api.authAwaitCallback({ platform });
        console.log("[AUTH] authAwaitCallback done, loading account status...");
        await this.loadAccountStatus(platform);
        console.log("[AUTH] Done!");
      } else {
        console.warn("[AUTH] No auth_url in result:", result);
      }
    } catch (error) {
      console.error("[AUTH] Authorization failed:", error);
    }
  }
  private async loadAccountStatus(platform: PlatformType): Promise<void> {
    try {
      const result = (await this.api.authStatus({ platform })) as { accounts?: any[] };
      if (result?.accounts) {
        const mapped: PlatformAccount[] = result.accounts.map((a: any) => ({
          id: a.id,
          platform: (a.platform as string).toLowerCase() as PlatformType,
          username: a.username,
          userId: a.userId || a.user_id,
          avatarUrl: a.avatarUrl || a.avatar_url || "",
          isConnected:
            a.authStatus === "Authorized" ||
            a.authStatus === "authorized" ||
            a.auth_status === "Authorized" ||
            a.auth_status === "authorized",
          authStatus: a.authStatus || a.auth_status,
          accessToken: a.accessToken || a.access_token,
          authorizedAt: a.authorizedAt || a.authorized_at,
        }));
        this._accounts.update((current) => {
          const others = current.filter((a) => a.platform !== platform);
          return [...others, ...mapped];
        });

        for (const account of mapped) {
          const existingChannels = this.chatList.getChannels();
          const hasChannel = existingChannels.some(
            (ch) => ch.platform === account.platform && ch.channelId === account.username
          );
          if (!hasChannel) {
            this.chatList.addChannel({
              platform: account.platform,
              channelId: account.username,
              channelName: account.username,
              accountId: account.id,
              isVisible: true,
              isAuthorized: true,
              addedAt: new Date().toISOString(),
            });
          }
        }
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

  async loadAllAccountStatuses(): Promise<void> {
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];
    for (const platform of platforms) {
      try {
        await this.loadAccountStatus(platform);
      } catch (error) {
        console.error(`[AUTH] Failed to load ${platform} account status:`, error);
      }
    }
  }
}
