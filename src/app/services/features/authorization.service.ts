import { Injectable, signal } from "@angular/core";
import { AuthStatus, ChatAccount, PlatformType } from "@models/chat.model";

const storageKey = "unichat-authorized-accounts";

const mockAccounts: ChatAccount[] = [
  {
    id: "acc-twitch-1",
    platform: "twitch",
    username: "StreamerBot",
    userId: "twitch-user-123",
    avatarUrl: undefined,
    authStatus: "authorized",
    accessToken: "mock-twitch-token",
    refreshToken: "mock-twitch-refresh",
    tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    authorizedAt: new Date().toISOString(),
  },
  {
    id: "acc-kick-1",
    platform: "kick",
    username: "KickStreamer",
    userId: "kick-user-456",
    avatarUrl: undefined,
    authStatus: "authorized",
    accessToken: "mock-kick-token",
    refreshToken: "mock-kick-refresh",
    tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    authorizedAt: new Date().toISOString(),
  },
];

@Injectable({
  providedIn: "root",
})
export class AuthorizationService {
  private readonly accountsSignal = signal<ChatAccount[]>(this.loadAccounts());

  readonly accounts = this.accountsSignal.asReadonly();

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

  authorize(platform: PlatformType): void {
    const mockAccount = mockAccounts.find((acc) => acc.platform === platform);

    if (mockAccount) {
      this.accountsSignal.update((accounts) => {
        const filtered = accounts.filter((acc) => acc.platform !== platform);
        return [...filtered, mockAccount];
      });
    } else {
      const newAccount: ChatAccount = {
        id: `acc-${platform}-${Date.now()}`,
        platform,
        username: `${platform.charAt(0).toUpperCase() + platform.slice(1)}User`,
        userId: `${platform}-user-${Date.now()}`,
        avatarUrl: undefined,
        authStatus: "authorized",
        accessToken: `mock-${platform}-token`,
        refreshToken: `mock-${platform}-refresh`,
        tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
        authorizedAt: new Date().toISOString(),
      };

      this.accountsSignal.update((accounts) => {
        const filtered = accounts.filter((acc) => acc.platform !== platform);
        return [...filtered, newAccount];
      });
    }
  }

  deauthorize(platform: PlatformType): void {
    this.accountsSignal.update((accounts) => accounts.filter((acc) => acc.platform !== platform));
  }

  private loadAccounts(): ChatAccount[] {
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      return mockAccounts;
    }

    try {
      const parsed = JSON.parse(stored) as ChatAccount[];
      return parsed;
    } catch {
      return mockAccounts;
    }
  }
}
