import { inject, signal } from "@angular/core";
import { PlatformType, ChatAccount, AuthStatus } from "@models/chat.model";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardFeedDataService } from "@services/ui/dashboard-feed-data.service";

const ACCOUNTS_CACHE_KEY = "unichat-accounts-cache";

interface CachedAccount {
  id: string;
  platform: PlatformType;
  username: string;
  userId: string;
  avatarUrl?: string;
  authStatus: AuthStatus;
  authorizedAt: string;
}

export interface RawAccount {
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

export class AuthorizationAccountsHandler {
  private readonly accountsSignal = signal<ChatAccount[]>([]);
  private readonly chatListService = inject(ChatListService);
  private readonly feedData = inject(DashboardFeedDataService);
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly localStorageService = inject(LocalStorageService);

  accountsLoaded = false;

  readonly accounts = this.accountsSignal.asReadonly();

  getAccounts(): ChatAccount[] {
    return this.accountsSignal();
  }

  setAccounts(accounts: ChatAccount[]): void {
    this.accountsSignal.set(accounts);
  }

  updateAccounts(updater: (accounts: ChatAccount[]) => ChatAccount[]): void {
    this.accountsSignal.update(updater);
  }

  saveAccountsCache(): void {
    const accounts = this.accountsSignal();
    const cacheData = accounts.map((acc) => ({
      id: acc.id,
      platform: acc.platform,
      username: acc.username,
      userId: acc.userId,
      avatarUrl: acc.avatarUrl,
      authStatus: acc.authStatus,
      authorizedAt: acc.authorizedAt,
    }));
    this.localStorageService.set(ACCOUNTS_CACHE_KEY, cacheData);
  }

  loadAccountsCache(): ChatAccount[] {
    const cached = this.localStorageService.get<CachedAccount[]>(ACCOUNTS_CACHE_KEY, []);
    if (!Array.isArray(cached) || cached.length === 0) {
      return [];
    }
    return cached.map((acc) => ({
      id: acc.id,
      platform: acc.platform,
      username: acc.username,
      userId: acc.userId,
      avatarUrl: acc.avatarUrl,
      authStatus: acc.authStatus,
      authorizedAt: acc.authorizedAt,
    }));
  }

  upsertAccount(account: RawAccount): void {
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
    this.saveAccountsCache();
  }

  removeAccount(accountId: string): void {
    this.accountsSignal.update((accounts) => accounts.filter((acc) => acc.id !== accountId));
    this.saveAccountsCache();
  }

  toChatAccount(account: RawAccount): ChatAccount {
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

  ensureChannelForAccount(account: RawAccount): void {
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

    this.logger.debug("ensureChannelForAuthorizedAccount", {
      source: "AuthorizationService",
      username: account.username,
    });

    if (matchingChannel) {
      if (matchingChannel.accountId !== account.id) {
        this.logger.debug("Linking existing channel to account", {
          source: "AuthorizationService",
          channelName: matchingChannel.channelName,
        });
        this.chatListService.updateChannelAccount(matchingChannel.id, account.id, account.username);
      }

      this.logger.debug("Loading messages for existing channel", {
        source: "AuthorizationService",
        channelId: matchingChannel.channelId,
      });
      this.feedData.loadChannelMessages(account.platform, matchingChannel.channelId);
    } else {
      this.logger.debug("Creating new channel for account", {
        source: "AuthorizationService",
        username: account.username,
      });
      const providerChannelId = account.username.toLowerCase();
      this.chatListService.addChannel(
        account.platform,
        account.username,
        providerChannelId,
        account.id,
        account.username
      );
      this.logger.debug("Loading messages for new channel", {
        source: "AuthorizationService",
        providerChannelId,
      });
      this.feedData.loadChannelMessages(account.platform, providerChannelId);
    }
  }

  linkAllChannelsToAccounts(): void {
    const platforms: PlatformType[] = ["twitch", "kick", "youtube"];

    for (const platform of platforms) {
      const account = this.accountsSignal().find((acc) => acc.platform === platform);
      if (!account || account.authStatus !== "authorized") {
        continue;
      }

      const channels = this.chatListService.getChannels(platform);
      for (const channel of channels) {
        if (!channel.accountId) {
          this.logger.debug("Linking channel to account", {
            source: "AuthorizationService",
            channelName: channel.channelName,
            username: account.username,
          });
          this.chatListService.updateChannelAccount(channel.id, account.id, account.username);
        }
      }
    }
  }
}
