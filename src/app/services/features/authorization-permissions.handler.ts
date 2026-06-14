import { inject, signal, DestroyRef } from "@angular/core";
import { PlatformType, ChatAccount, AuthStatus } from "@models/chat.model";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { AuthorizationAccountsHandler, RawAccount } from "./authorization-accounts.handler";
import { TauriApiService } from "@app/api/tauri-api.service";
import { WAIT_FOR_ACCOUNTS_TIMEOUT_MS } from "@shared/utils/constants";

export interface AuthCommandResultPayload {
  success: boolean;
  message: string;
  authUrl?: string;
  account?: RawAccount;
  accounts?: RawAccount[];
}

export interface TokenRefreshEvent {
  accountId: string;
  platform: PlatformType;
}

export class AuthorizationPermissionsHandler {
  private readonly accountsHandler: AuthorizationAccountsHandler;
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tauriApi = inject(TauriApiService);

  private autoRefreshIntervalId: ReturnType<typeof setInterval> | null = null;

  private readonly tokenRefreshedSignal = signal<TokenRefreshEvent | null>(null);
  readonly tokenRefreshed = this.tokenRefreshedSignal.asReadonly();

  constructor(accountsHandler: AuthorizationAccountsHandler) {
    this.accountsHandler = accountsHandler;
  }

  getAuthStatus(platform: PlatformType): AuthStatus {
    const account = this.accountsHandler.getAccounts().find((acc) => acc.platform === platform);
    return account?.authStatus ?? "unauthorized";
  }

  getAccount(platform: PlatformType): ChatAccount | undefined {
    return this.accountsHandler.getAccounts().find((acc) => acc.platform === platform);
  }

  getPrimaryAccount(platform: PlatformType): ChatAccount | undefined {
    return this.accountsHandler.getAccounts().find((acc) => acc.platform === platform);
  }

  async getAccountById(
    accountId: string | undefined,
    timeoutMs: number = WAIT_FOR_ACCOUNTS_TIMEOUT_MS
  ): Promise<ChatAccount | undefined> {
    if (!accountId) {
      return undefined;
    }

    if (!this.accountsHandler.accountsLoaded) {
      const startTime = Date.now();
      while (!this.accountsHandler.accountsLoaded && Date.now() - startTime < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return this.accountsHandler.getAccounts().find((acc) => acc.id === accountId);
  }

  getAccountByIdSync(accountId: string | undefined): ChatAccount | undefined {
    if (!accountId) {
      return undefined;
    }
    return this.accountsHandler.getAccounts().find((acc) => acc.id === accountId);
  }

  isAuthorized(platform: PlatformType): boolean {
    return this.getAuthStatus(platform) === "authorized";
  }

  async validateAllPlatforms(): Promise<void> {
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];

    for (const platform of platforms) {
      try {
        const result = await this.tauriApi.authValidate({ platform }) as AuthCommandResultPayload;
        if (result.accounts?.length) {
          for (const account of result.accounts) {
            this.accountsHandler.upsertAccount(account);
          }
        }
      } catch {
        // Validation errors silently ignored
      }
    }
  }

  async validatePlatform(platform: PlatformType): Promise<boolean> {
    try {
      const result = await this.tauriApi.authValidate({ platform }) as AuthCommandResultPayload;
      if (result.accounts?.length) {
        const account = result.accounts[0];
        this.accountsHandler.upsertAccount(account);
        return account.authStatus === "authorized";
      }
      return false;
    } catch {
      return false;
    }
  }

  async refreshAccountToken(accountId: string, platform: PlatformType): Promise<boolean> {
    try {
      const result = await this.tauriApi.authRefresh({
        platform,
        accountId,
      }) as AuthCommandResultPayload;
      if (result.account) {
        this.accountsHandler.upsertAccount(result.account);
        this.logger.info(
          "Token refreshed for",
          { source: "AuthorizationService", platform, username: result.account.username }
        );
        return result.account.authStatus === "authorized";
      }
      return false;
    } catch (error) {
      this.logger.error("Failed to refresh token for", error, { source: "AuthorizationService", platform });
      return false;
    }
  }

  async refreshAndReconnect(accountId: string, platform: PlatformType): Promise<boolean> {
    const success = await this.refreshAccountToken(accountId, platform);
    if (success) {
      this.logger.info(
        "Token refreshed, emitting reconnect event for account",
        { source: "AuthorizationService", accountId }
      );
      this.tokenRefreshedSignal.set({ accountId, platform });
    }
    return success;
  }

  async refreshAllExpiredTokens(): Promise<Map<PlatformType, boolean>> {
    const results = new Map<PlatformType, boolean>();
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];

    for (const platform of platforms) {
      const account = this.accountsHandler.getAccounts().find((acc) => acc.platform === platform);
      if (account && (account.authStatus === "tokenExpired" || account.authStatus === "revoked")) {
        const success = await this.refreshAccountToken(account.id, platform);
        if (success) {
          this.tokenRefreshedSignal.set({ accountId: account.id, platform });
        }
        results.set(platform, success);
      }
    }

    return results;
  }

  startAutoRefresh(): void {
    if (this.autoRefreshIntervalId) {
      return;
    }

    const THIRTY_MINUTES = 30 * 60 * 1000;
    this.autoRefreshIntervalId = setInterval(() => {
      this.logger.info("Running periodic token refresh check", { source: "AuthorizationService" });
      void this.refreshAllExpiredTokens();
    }, THIRTY_MINUTES);

    this.destroyRef.onDestroy(() => {
      this.stopAutoRefresh();
    });
  }

  stopAutoRefresh(): void {
    if (this.autoRefreshIntervalId) {
      clearInterval(this.autoRefreshIntervalId);
      this.autoRefreshIntervalId = null;
    }
  }

  needsReauthentication(platform: PlatformType): boolean {
    const account = this.getPrimaryAccount(platform);
    if (!account) {
      return false;
    }
    return account.authStatus === "tokenExpired" || account.authStatus === "revoked";
  }
}
