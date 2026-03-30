/* sys lib */
import { Injectable, inject, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/* models */
import { AuthStatus, ChatAccount, PlatformType } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
interface AuthAccountPayload {
  id: string;
  platform: PlatformType;
  username: string;
  userId: string;
  authStatus: AuthStatus;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  authorizedAt: string;
}

interface AuthCommandResultPayload {
  success: boolean;
  message: string;
  authUrl?: string;
  account?: AuthAccountPayload;
  accounts?: AuthAccountPayload[];
}

@Injectable({
  providedIn: "root",
})
export class AuthorizationService {
  private readonly accountsSignal = signal<ChatAccount[]>([]);
  private readonly chatListService = inject(ChatListService);

  readonly accounts = this.accountsSignal.asReadonly();

  constructor() {
    void this.refreshStatuses();
  }

  getAuthStatus(platform: PlatformType): AuthStatus {
    const account = this.getPrimaryAccount(platform);
    return account?.authStatus ?? "unauthorized";
  }

  getAccount(platform: PlatformType): ChatAccount | undefined {
    return this.getPrimaryAccount(platform);
  }

  getPrimaryAccount(platform: PlatformType): ChatAccount | undefined {
    return this.accountsSignal().find((acc) => acc.platform === platform);
  }

  getAccountById(accountId: string | undefined): ChatAccount | undefined {
    if (!accountId) {
      return undefined;
    }
    return this.accountsSignal().find((acc) => acc.id === accountId);
  }

  isAuthorized(platform: PlatformType): boolean {
    return this.getAuthStatus(platform) === "authorized";
  }

  async authorize(platform: PlatformType): Promise<void> {
    const result = await invoke<AuthCommandResultPayload>("authStart", { platform });
    if (result.authUrl) {
      await openUrl(result.authUrl);
      const completed = await invoke<AuthCommandResultPayload>("authAwaitCallback", { platform });
      if (completed.account) {
        this.upsertAccount(completed.account);
        this.ensureChannelForAuthorizedAccount(completed.account);
      }
    }
  }

  async completeAuthorization(platform: PlatformType, callbackUrl: string): Promise<void> {
    const result = await invoke<AuthCommandResultPayload>("authComplete", {
      platform,
      callbackUrl,
    });
    if (result.account) {
      this.upsertAccount(result.account);
      this.ensureChannelForAuthorizedAccount(result.account);
    }
  }

  async deauthorize(platform: PlatformType): Promise<void> {
    const primary = this.getPrimaryAccount(platform);
    if (!primary) {
      return;
    }
    await this.deauthorizeAccount(primary.id, platform);
  }

  async deauthorizeAccount(accountId: string, platform: PlatformType): Promise<void> {
    await invoke<AuthCommandResultPayload>("authDisconnect", { platform, accountId });
    this.accountsSignal.update((accounts) => accounts.filter((acc) => acc.id !== accountId));
    for (const channel of this.chatListService.getChannels(platform)) {
      if (channel.accountId === accountId) {
        this.chatListService.updateChannelAccount(channel.id, undefined);
      }
    }
  }

  private async refreshStatuses(): Promise<void> {
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];
    const loaded: ChatAccount[] = [];

    for (const platform of platforms) {
      try {
        const result = await invoke<AuthCommandResultPayload>("authStatus", { platform });
        if (result.accounts?.length) {
          for (const account of result.accounts) {
            loaded.push(this.toChatAccount(account));
            this.ensureChannelForAuthorizedAccount(account);
          }
        }
      } catch {
        // Ignore initialization errors to keep settings UI responsive.
      }
    }

    this.accountsSignal.set(loaded);
  }

  private upsertAccount(account: AuthAccountPayload): void {
    const mapped = this.toChatAccount(account);
    this.accountsSignal.update((accounts) => {
      const idx = accounts.findIndex((acc) => acc.id === mapped.id);
      if (idx >= 0) {
        const next = [...accounts];
        next[idx] = mapped;
        return next;
      }
      return [...accounts, mapped];
    });
  }

  private toChatAccount(account: AuthAccountPayload): ChatAccount {
    return {
      id: account.id,
      platform: account.platform,
      username: account.username,
      userId: account.userId,
      avatarUrl: undefined,
      authStatus: account.authStatus,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      tokenExpiresAt: account.tokenExpiresAt,
      authorizedAt: account.authorizedAt,
    };
  }

  private ensureChannelForAuthorizedAccount(account: AuthAccountPayload): void {
    if (account.platform !== "twitch" && account.platform !== "youtube") {
      return;
    }

    const existing = this.chatListService
      .getChannels(account.platform)
      .some((channel) => channel.channelName.toLowerCase() === account.username.toLowerCase());
    if (!existing) {
      this.chatListService.addChannel(
        account.platform,
        account.username,
        account.username,
        account.id,
        account.username
      );
    }
  }
}
