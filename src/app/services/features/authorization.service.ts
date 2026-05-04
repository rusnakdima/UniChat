/* sys lib */
import { DestroyRef, Injectable, inject, signal } from "@angular/core";
import { Subject } from "rxjs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

/* models */
import { AuthStatus, ChatAccount, PlatformType } from "@models/chat.model";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
interface AuthAccountPayload {
  id: string;
  platform: PlatformType;
  username: string;
  userId: string;
  avatarUrl?: string;
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
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);
  private accountsLoaded = false;

  /**
   * Event emitted after a successful token refresh.
   * Listeners (e.g. ChatProviderCoordinatorService) handle reconnection.
   */
  readonly tokenRefreshed = new Subject<{ accountId: string; platform: PlatformType }>();

  readonly accounts = this.accountsSignal.asReadonly();

  constructor() {
    void this.refreshStatuses();

    // Listen for OAuth completion events from deep links
    void listen<ChatAccount>("oauth-complete", (event) => {
      this.logger.info("AuthorizationService", "Received oauth-complete event", event.payload);
      this.upsertAccount(event.payload);
      this.ensureChannelForAuthorizedAccount(event.payload);
    });

    void listen<string>("oauth-error", (event) => {
      this.logger.error("AuthorizationService", "Received oauth-error event", event.payload);
    });
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
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

  /**
   * Get account by ID. Waits for accounts to load if needed.
   * @param accountId - The account ID to find
   * @param timeoutMs - Maximum time to wait for accounts to load (default 5 seconds)
   * @returns The account or undefined if not found
   */
  async getAccountById(
    accountId: string | undefined,
    timeoutMs: number = 5000
  ): Promise<ChatAccount | undefined> {
    if (!accountId) {
      return undefined;
    }

    // Wait for accounts to load if needed
    if (!this.accountsLoaded) {
      const loaded = await this.waitForAccounts(timeoutMs);
      if (!loaded) {
        this.logger.warn("AuthorizationService", "Timeout waiting for accounts to load");
        return undefined;
      }
    }

    return this.accountsSignal().find((acc) => acc.id === accountId);
  }

  /**
   * Synchronous version of getAccountById - use only when accounts are guaranteed to be loaded
   */
  getAccountByIdSync(accountId: string | undefined): ChatAccount | undefined {
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
      // Check if we're using deep links (Flatpak) or localhost
      const isDeepLink = result.authUrl.includes("unichat://");

      await openUrl(result.authUrl);

      if (isDeepLink) {
        // For deep links, the OAuth flow is asynchronous
        // The backend will emit events when the deep-link callback is received
        this.logger.info("AuthorizationService", "Started deep-link OAuth flow for", platform);
        // The completion will be handled by the persistent event listeners in the constructor
        return Promise.resolve();
      } else {
        // For localhost, use the traditional synchronous flow
        const completed = await invoke<AuthCommandResultPayload>("authAwaitCallback", { platform });

        if (completed.account) {
          this.logger.info(
            "AuthorizationService",
            "Initial account from backend",
            completed.account.username
          );

          // For Kick, the backend now fetches the real username from the OAuth identity
          // No need to prompt user for username anymore
          if (platform === "kick") {
            this.logger.info(
              "AuthorizationService",
              "Kick account created with username",
              completed.account.username
            );
          }

          this.upsertAccount(completed.account);
          this.ensureChannelForAuthorizedAccount(completed.account);
        }
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

      const data = await response.json();
      const kickData = data as {
        user?: { username?: string; id?: number };
        username?: string;
        id?: number;
      };
      const username = kickData.user?.username || kickData.username;
      const userId = String(kickData.user?.id || kickData.id || "");

      if (username && userId) {
        // Update account in memory
        const accounts = this.accountsSignal();
        const accountIndex = accounts.findIndex((acc) => acc.id === accountId);

        if (accountIndex >= 0) {
          const updatedAccount = { ...accounts[accountIndex], username, userId };
          const newAccounts = [...accounts];
          newAccounts[accountIndex] = updatedAccount;
          this.accountsSignal.set(newAccounts);

          this.logger.info(
            "AuthorizationService",
            "Kick OAuth updated username from channel",
            username
          );
        }
      }
    } catch {
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
    this.logger.info("AuthorizationService", "Accounts loaded", loaded.length, "accounts");

    // Then validate tokens in background (async, non-blocking)
    // After validation completes, auto-refresh any expired tokens
    void this.validateAllPlatforms().then(() => {
      this.logger.info(
        "AuthorizationService",
        "Validation complete, attempting auto-refresh of expired tokens"
      );
      void this.refreshAllExpiredTokens();
    });

    // Link any unlinked channels to authorized accounts
    void this.linkAllChannelsToAccounts();
  }

  /**
   * Link all channels to their corresponding authorized accounts
   * Links all channels for authorized platforms (not just owned channels)
   */
  private async linkAllChannelsToAccounts(): Promise<void> {
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];

    for (const platform of platforms) {
      const account = this.getPrimaryAccount(platform);
      if (!account || account.authStatus !== "authorized") {
        continue;
      }

      const channels = this.chatListService.getChannels(platform);
      for (const channel of channels) {
        // Link channel to account if it doesn't have one yet
        // This allows sending to any channel, not just your own
        if (!channel.accountId) {
          this.logger.debug(
            "AuthorizationService",
            "Linking channel to account",
            channel.channelName,
            account.username
          );
          this.chatListService.updateChannelAccount(channel.id, account.id, account.username);
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
      } catch {
        // Validation errors are silently ignored to keep flow working
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
    } catch {
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

        // Notify services to reconnect with new token
        this.logger.info(
          "AuthorizationService",
          "Token refreshed for",
          platform,
          result.account.username
        );

        return result.account.authStatus === "authorized";
      }
      return false;
    } catch (error) {
      this.logger.error("AuthorizationService", "Failed to refresh token for", platform, error);
      return false;
    }
  }

  /**
   * Refresh token and emit event for services to reconnect.
   * Called by platform services when they detect expired tokens.
   */
  async refreshAndReconnect(accountId: string, platform: PlatformType): Promise<boolean> {
    const success = await this.refreshAccountToken(accountId, platform);
    if (success) {
      this.logger.info(
        "AuthorizationService",
        "Token refreshed, emitting reconnect event for account",
        accountId
      );
      // Emit event — coordinator (or any listener) handles reconnection
      this.tokenRefreshed.next({ accountId, platform });
    }
    return success;
  }

  /**
   * Try to refresh expired tokens for all platforms.
   * Emits tokenRefreshed events for successful refreshes so channels reconnect.
   * Returns map of platform to success status.
   */
  async refreshAllExpiredTokens(): Promise<Map<PlatformType, boolean>> {
    const results = new Map<PlatformType, boolean>();
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];

    for (const platform of platforms) {
      const account = this.getPrimaryAccount(platform);
      if (account && (account.authStatus === "tokenExpired" || account.authStatus === "revoked")) {
        const success = await this.refreshAccountToken(account.id, platform);
        if (success) {
          // Emit event so coordinator reconnects channels for this account
          this.tokenRefreshed.next({ accountId: account.id, platform });
        }
        results.set(platform, success);
      }
    }

    return results;
  }

  /**
   * Start automatic token refresh every 30 minutes.
   * Checks all platforms for expired tokens and auto-refreshes them.
   * Call this on application initialization.
   */
  private autoRefreshIntervalId: ReturnType<typeof setInterval> | null = null;

  startAutoRefresh(): void {
    if (this.autoRefreshIntervalId) {
      return; // Already running
    }

    const THIRTY_MINUTES = 30 * 60 * 1000;
    this.autoRefreshIntervalId = setInterval(() => {
      this.logger.info("AuthorizationService", "Running periodic token refresh check");
      void this.refreshAllExpiredTokens();
    }, THIRTY_MINUTES);
  }

  /**
   * Stop automatic token refresh.
   * Call this on application cleanup.
   */
  stopAutoRefresh(): void {
    if (this.autoRefreshIntervalId) {
      clearInterval(this.autoRefreshIntervalId);
      this.autoRefreshIntervalId = null;
    }
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
      avatarUrl: account.avatarUrl,
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

    this.logger.debug(
      "AuthorizationService",
      "ensureChannelForAuthorizedAccount",
      account.username
    );

    if (matchingChannel) {
      // Channel exists but might not have the account linked - update it!
      if (matchingChannel.accountId !== account.id) {
        this.logger.debug(
          "AuthorizationService",
          "Linking existing channel to account",
          matchingChannel.channelName
        );
        this.chatListService.updateChannelAccount(matchingChannel.id, account.id, account.username);
      }

      // Ensure channel messages are loaded
      // This will trigger the coordinator to connect the channel if needed
      this.logger.debug(
        "AuthorizationService",
        "Loading messages for existing channel",
        matchingChannel.channelId
      );
      this.feedData.loadChannelMessages(account.platform, matchingChannel.channelId);
    } else {
      // No channel exists, create a new one
      this.logger.debug(
        "AuthorizationService",
        "Creating new channel for account",
        account.username
      );
      const providerChannelId = account.username.toLowerCase();
      this.chatListService.addChannel(
        account.platform,
        account.username,
        providerChannelId,
        account.id,
        account.username
      );
      // Ensure new channel messages are loaded
      this.logger.debug(
        "AuthorizationService",
        "Loading messages for new channel",
        providerChannelId
      );
      this.feedData.loadChannelMessages(account.platform, providerChannelId);
    }
  }
}
