/* sys lib */
import { Injectable, inject, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/* models */
import { AuthStatus, ChatAccount, PlatformType } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
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
  private readonly feedData = inject(DashboardFeedDataService);
  private accountsLoaded = false;

  readonly accounts = this.accountsSignal.asReadonly();

  constructor() {
    void this.refreshStatuses();
  }

  /**
   * Wait for accounts to be loaded from backend
   */
  async waitForAccounts(timeoutMs = 5000): Promise<boolean> {
    if (this.accountsLoaded) {
      return true;
    }

    const startTime = Date.now();
    while (!this.accountsLoaded && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return this.accountsLoaded;
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

    const account = this.accountsSignal().find((acc) => acc.id === accountId);

    // If account not found and accounts aren't loaded yet, wait a bit
    if (!account && !this.accountsLoaded) {
      console.warn(
        "[Authorization] Account not found but accounts not loaded yet, waiting...",
        accountId
      );
      // Note: We can't await here since this is a synchronous method
      // The caller should use waitForAccounts() first if needed
    }

    return account;
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
        console.log("[Kick OAuth] Initial account from backend:", completed.account);

        // For Kick, the backend now fetches the real username from the OAuth identity
        // No need to prompt user for username anymore
        if (platform === "kick") {
          console.log("[Kick OAuth] Account created with username:", completed.account.username);
        }

        this.upsertAccount(completed.account);
        this.ensureChannelForAuthorizedAccount(completed.account);
      }
    }
  }

  /**
   * Update Kick account username by fetching from channel info
   * Called when connecting to a channel to get real username
   */
  async updateKickUsernameFromChannel(accountId: string, channelName: string): Promise<void> {
    try {
      const response = await fetch(`https://kick.com/api/v1/channels/${channelName}`);
      if (!response.ok) {
        return; // Silently fail - not critical
      }

      const data = (await response.json()) as any;
      const username = data.user?.username || data.username;
      const userId = String(data.user?.id || data.id || "");

      if (username && userId) {
        // Update account in memory
        const accounts = this.accountsSignal();
        const accountIndex = accounts.findIndex((acc) => acc.id === accountId);

        if (accountIndex >= 0) {
          const updatedAccount = { ...accounts[accountIndex], username, userId };
          const newAccounts = [...accounts];
          newAccounts[accountIndex] = updatedAccount;
          this.accountsSignal.set(newAccounts);

          console.log("[Kick OAuth] Updated username from channel:", username);
        }
      }
    } catch (error) {
      // Silently fail - username update is nice-to-have
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
        // First load status without validation (fast)
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

    // Mark accounts as loaded
    this.accountsLoaded = true;
    console.log("[Authorization] Accounts loaded:", loaded.length, "accounts");

    // Then validate tokens in background (async, non-blocking)
    void this.validateAllPlatforms();

    // Link any unlinked channels to authorized accounts
    void this.linkAllChannelsToAccounts();
  }

  /**
   * Link all channels to their corresponding authorized accounts
   * This fixes the issue where channels were added before authorization
   */
  private async linkAllChannelsToAccounts(): Promise<void> {
    const platforms: PlatformType[] = ["twitch", "youtube"];

    for (const platform of platforms) {
      const account = this.getPrimaryAccount(platform);
      if (!account || account.authStatus !== "authorized") {
        continue;
      }

      const channels = this.chatListService.getChannels(platform);
      for (const channel of channels) {
        // Link channel to account if they match by username but channel has no account
        if (
          !channel.accountId &&
          channel.channelName.toLowerCase() === account.username.toLowerCase()
        ) {
          console.log("[Authorization] Auto-linking channel to account:", {
            platform,
            channelId: channel.id,
            channelName: channel.channelName,
            accountId: account.id,
            username: account.username,
          });
          this.chatListService.updateChannelAccount(channel.id, account.id);
        }
      }
    }
  }

  /**
   * Validate all platform tokens in background
   * Updates account statuses if tokens are expired or invalid
   */
  async validateAllPlatforms(): Promise<void> {
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];

    for (const platform of platforms) {
      try {
        const result = await invoke<AuthCommandResultPayload>("authValidate", { platform });
        if (result.accounts?.length) {
          for (const account of result.accounts) {
            this.upsertAccount(account);
          }
        }
      } catch (error) {
        // Validation errors are logged but don't break the flow
        console.warn(`Failed to validate ${platform} auth:`, error);
      }
    }
  }

  /**
   * Validate a specific platform's authentication
   * Returns true if authorized with valid token
   */
  async validatePlatform(platform: PlatformType): Promise<boolean> {
    try {
      const result = await invoke<AuthCommandResultPayload>("authValidate", { platform });
      if (result.accounts?.length) {
        const account = result.accounts[0];
        this.upsertAccount(account);
        return account.authStatus === "authorized";
      }
      return false;
    } catch (error) {
      console.warn(`Failed to validate ${platform} auth:`, error);
      return false;
    }
  }

  /**
   * Refresh an expired token for a specific account
   * Returns true if refresh was successful
   */
  async refreshAccountToken(accountId: string, platform: PlatformType): Promise<boolean> {
    try {
      const result = await invoke<AuthCommandResultPayload>("authRefresh", {
        platform,
        accountId,
      });
      if (result.account) {
        this.upsertAccount(result.account);
        return result.account.authStatus === "authorized";
      }
      return false;
    } catch (error) {
      console.error(`Failed to refresh token for ${platform}:`, error);
      return false;
    }
  }

  /**
   * Try to refresh expired tokens for all platforms
   * Returns map of platform to success status
   */
  async refreshAllExpiredTokens(): Promise<Map<PlatformType, boolean>> {
    const results = new Map<PlatformType, boolean>();
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];

    for (const platform of platforms) {
      const account = this.getPrimaryAccount(platform);
      if (account && (account.authStatus === "tokenExpired" || account.authStatus === "revoked")) {
        const success = await this.refreshAccountToken(account.id, platform);
        results.set(platform, success);
      }
    }

    return results;
  }

  /**
   * Check if re-authentication is needed for a platform
   * Returns true if token is expired/revoked and refresh failed
   */
  needsReauthentication(platform: PlatformType): boolean {
    const account = this.getPrimaryAccount(platform);
    if (!account) {
      return false;
    }
    return account.authStatus === "tokenExpired" || account.authStatus === "revoked";
  }

  /**
   * Re-authenticate a platform
   * Starts a new OAuth flow for the platform
   */
  async reauthorize(platform: PlatformType): Promise<void> {
    // First deauthorize the existing account
    const existingAccount = this.getPrimaryAccount(platform);
    if (existingAccount) {
      await this.deauthorizeAccount(existingAccount.id, platform);
    }

    // Start new authorization
    await this.authorize(platform);
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
    if (
      account.platform !== "twitch" &&
      account.platform !== "kick" &&
      account.platform !== "youtube"
    ) {
      return;
    }

    const channels = this.chatListService.getChannels(account.platform);
    const matchingChannel = channels.find(
      (channel) => channel.channelName.toLowerCase() === account.username.toLowerCase()
    );

    console.log("[Authorization] ensureChannelForAuthorizedAccount:", {
      platform: account.platform,
      username: account.username,
      accountId: account.id,
      hasMatchingChannel: !!matchingChannel,
      matchingChannelAccountId: matchingChannel?.accountId,
    });

    if (matchingChannel) {
      // Channel exists but might not have the account linked - update it!
      if (matchingChannel.accountId !== account.id) {
        console.log("[Authorization] Linking existing channel to account:", {
          channelId: matchingChannel.id,
          channelName: matchingChannel.channelName,
          accountId: account.id,
          username: account.username,
        });
        this.chatListService.updateChannelAccount(matchingChannel.id, account.id);
      }
      // Ensure channel messages are loaded
      console.log(
        "[Authorization] Loading messages for existing channel:",
        matchingChannel.channelId
      );
      this.feedData.loadChannelMessages(account.platform, matchingChannel.channelId);
    } else {
      // No channel exists, create a new one
      console.log("[Authorization] Creating new channel for account:", account.username);
      const providerChannelId = account.username.toLowerCase();
      this.chatListService.addChannel(
        account.platform,
        account.username,
        providerChannelId,
        account.id,
        account.username
      );
      // Ensure new channel messages are loaded
      console.log("[Authorization] Loading messages for new channel:", providerChannelId);
      this.feedData.loadChannelMessages(account.platform, providerChannelId);
    }
  }
}
