/* sys lib */
import { DestroyRef, Injectable, inject, signal } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/* models */
import { AuthStatus, ChatAccount, PlatformType } from "@models/chat.model";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";
import { AuthorizationAuthHandler } from "./authorization-auth.handler";
import { AuthorizationAccountsHandler } from "./authorization-accounts.handler";
import {
  AuthorizationPermissionsHandler,
  AuthCommandResultPayload,
} from "./authorization-permissions.handler";

@Injectable({
  providedIn: "root",
})
export class AuthorizationService {
  private readonly accountsHandler = new AuthorizationAccountsHandler();
  private readonly authHandler = new AuthorizationAuthHandler();
  private readonly permissionsHandler = new AuthorizationPermissionsHandler(this.accountsHandler);

  private readonly chatListService = inject(ChatListService);
  private readonly feedData = inject(DashboardFeedDataService);
  private readonly logger = inject(LoggerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localStorageService = inject(LocalStorageService);

  readonly tokenRefreshed = this.permissionsHandler.tokenRefreshed;

  readonly accounts = this.accountsHandler.accounts;

  constructor() {
    this.authHandler.onUsernameUpdate = (accountId, username, userId) => {
      const accounts = this.accountsHandler.getAccounts();
      const accountIndex = accounts.findIndex((acc) => acc.id === accountId);
      if (accountIndex >= 0) {
        const updatedAccount = { ...accounts[accountIndex], username, userId };
        const newAccounts = [...accounts];
        newAccounts[accountIndex] = updatedAccount;
        this.accountsHandler.setAccounts(newAccounts);
        this.logger.info(
          "AuthorizationService",
          "Kick OAuth updated username from channel",
          username
        );
      }
    };

    void this.refreshStatuses();

    void listen<ChatAccount>("oauth-complete", (event) => {
      this.logger.info("AuthorizationService", "Received oauth-complete event", event.payload);
      this.accountsHandler.upsertAccount(event.payload);
      this.accountsHandler.ensureChannelForAccount(event.payload);
    });

    void listen<string>("oauth-error", (event) => {
      this.logger.error("AuthorizationService", "Received oauth-error event", event.payload);
    });
  }

  async waitForAccounts(timeoutMs = 5000): Promise<boolean> {
    if (this.accountsHandler.accountsLoaded) {
      return true;
    }

    const startTime = Date.now();
    while (!this.accountsHandler.accountsLoaded && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return this.accountsHandler.accountsLoaded;
  }

  getAuthStatus(platform: PlatformType): AuthStatus {
    return this.permissionsHandler.getAuthStatus(platform);
  }

  getAccount(platform: PlatformType): ChatAccount | undefined {
    return this.permissionsHandler.getAccount(platform);
  }

  getPrimaryAccount(platform: PlatformType): ChatAccount | undefined {
    return this.permissionsHandler.getPrimaryAccount(platform);
  }

  async getAccountById(
    accountId: string | undefined,
    timeoutMs: number = 5000
  ): Promise<ChatAccount | undefined> {
    return this.permissionsHandler.getAccountById(accountId, timeoutMs);
  }

  getAccountByIdSync(accountId: string | undefined): ChatAccount | undefined {
    return this.permissionsHandler.getAccountByIdSync(accountId);
  }

  isAuthorized(platform: PlatformType): boolean {
    return this.permissionsHandler.isAuthorized(platform);
  }

  async authorize(platform: PlatformType): Promise<void> {
    const result = await this.authHandler.startAuthorization(platform);
    if (result.account) {
      this.logger.info(
        "AuthorizationService",
        "Initial account from backend",
        result.account.username
      );
      if (platform === "kick") {
        this.logger.info(
          "AuthorizationService",
          "Kick account created with username",
          result.account.username
        );
      }
      this.accountsHandler.upsertAccount(result.account);
      this.accountsHandler.ensureChannelForAccount(result.account);
    }
  }

  async updateKickUsernameFromChannel(accountId: string, channelName: string): Promise<void> {
    await this.authHandler.updateKickUsernameFromChannel(accountId, channelName);
  }

  async completeAuthorization(platform: PlatformType, callbackUrl: string): Promise<void> {
    const result = await this.authHandler.completeAuthorization(platform, callbackUrl);
    if (result.account) {
      this.accountsHandler.upsertAccount(result.account);
      this.accountsHandler.ensureChannelForAccount(result.account);
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
    await this.authHandler.disconnect(platform, accountId);
    this.accountsHandler.removeAccount(accountId);
    for (const channel of this.chatListService.getChannels(platform)) {
      if (channel.accountId === accountId) {
        this.chatListService.updateChannelAccount(channel.id, undefined);
      }
    }
  }

  private async refreshStatuses(): Promise<void> {
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];

    const cachedAccounts = this.accountsHandler.loadAccountsCache();
    if (cachedAccounts.length > 0) {
      this.accountsHandler.setAccounts(cachedAccounts);
      this.accountsHandler.accountsLoaded = true;
      this.logger.info("AuthorizationService", "Loaded cached accounts", cachedAccounts.length);
    }

    const loaded: ChatAccount[] = [];

    for (const platform of platforms) {
      try {
        const result = await invoke<AuthCommandResultPayload>("authStatus", { platform });
        if (result.accounts?.length) {
          for (const account of result.accounts) {
            loaded.push(this.accountsHandler.toChatAccount(account));
            this.accountsHandler.ensureChannelForAccount(account);
          }
        }
      } catch {
        // Ignore initialization errors
      }
    }

    if (loaded.length > 0) {
      this.accountsHandler.setAccounts(loaded);
      this.accountsHandler.saveAccountsCache();
    }

    this.accountsHandler.accountsLoaded = true;
    this.logger.info("AuthorizationService", "Accounts loaded", loaded.length, "accounts");

    void this.permissionsHandler.validateAllPlatforms().then(() => {
      this.logger.info(
        "AuthorizationService",
        "Validation complete, attempting auto-refresh of expired tokens"
      );
      void this.permissionsHandler.refreshAllExpiredTokens();
    });

    void this.accountsHandler.linkAllChannelsToAccounts();
  }

  async validateAllPlatforms(): Promise<void> {
    return this.permissionsHandler.validateAllPlatforms();
  }

  async validatePlatform(platform: PlatformType): Promise<boolean> {
    return this.permissionsHandler.validatePlatform(platform);
  }

  async refreshAccountToken(accountId: string, platform: PlatformType): Promise<boolean> {
    return this.permissionsHandler.refreshAccountToken(accountId, platform);
  }

  async refreshAndReconnect(accountId: string, platform: PlatformType): Promise<boolean> {
    return this.permissionsHandler.refreshAndReconnect(accountId, platform);
  }

  async refreshAllExpiredTokens(): Promise<Map<PlatformType, boolean>> {
    return this.permissionsHandler.refreshAllExpiredTokens();
  }

  startAutoRefresh(): void {
    this.permissionsHandler.startAutoRefresh();
  }

  stopAutoRefresh(): void {
    this.permissionsHandler.stopAutoRefresh();
  }

  needsReauthentication(platform: PlatformType): boolean {
    return this.permissionsHandler.needsReauthentication(platform);
  }

  async reauthorize(platform: PlatformType): Promise<void> {
    const existingAccount = this.getPrimaryAccount(platform);
    if (existingAccount) {
      await this.deauthorizeAccount(existingAccount.id, platform);
    }
    await this.authorize(platform);
  }
}
