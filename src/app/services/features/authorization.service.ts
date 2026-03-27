import { Injectable, inject, signal } from "@angular/core";
import { AuthStatus, ChatAccount, PlatformType } from "@models/chat.model";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChatListService } from "@services/data/chat-list.service";

interface AuthAccountPayload {
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
    const account = this.accountsSignal().find((acc) => acc.platform === platform);
    return account?.authStatus ?? "unauthorized";
  }

  getAccount(platform: PlatformType): ChatAccount | undefined {
    return this.accountsSignal().find((acc) => acc.platform === platform);
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
    await invoke<AuthCommandResultPayload>("authDisconnect", { platform });
    this.accountsSignal.update((accounts) => accounts.filter((acc) => acc.platform !== platform));
  }

  private async refreshStatuses(): Promise<void> {
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];
    const loaded: ChatAccount[] = [];

    for (const platform of platforms) {
      try {
        const result = await invoke<AuthCommandResultPayload>("authStatus", { platform });
        if (result.account) {
          loaded.push(this.toChatAccount(result.account));
          this.ensureChannelForAuthorizedAccount(result.account);
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
      const filtered = accounts.filter((acc) => acc.platform !== account.platform);
      return [...filtered, mapped];
    });
  }

  private toChatAccount(account: AuthAccountPayload): ChatAccount {
    return {
      id: `acc-${account.platform}-${account.userId}`,
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
    if (account.platform !== "twitch") {
      return;
    }

    const existing = this.chatListService
      .getChannels("twitch")
      .some((channel) => channel.channelName.toLowerCase() === account.username.toLowerCase());
    if (!existing) {
      this.chatListService.addChannel(
        "twitch",
        account.username,
        account.username,
        `acc-twitch-${account.userId}`
      );
    }
  }
}
