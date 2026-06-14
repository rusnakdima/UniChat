/* sys lib */
import { Injectable, inject } from "@angular/core";
import tmi from "tmi.js";

/* services */
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { ReconnectionService } from "@services/core/reconnection.service";
import { normalizeChannelId } from "@utils/channel-normalization.util";

export type TwitchConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface TwitchClientConfig {
  channelId: string;
  username?: string;
  accessToken?: string;
}

type StatusListener = (channelId: string, status: TwitchConnectionStatus) => void;

@Injectable({
  providedIn: "root",
})
export class TwitchConnectionService {
  private readonly clientsByChannel = new Map<string, tmi.Client>();
  private readonly connectedListeners = new Map<string, () => void>();
  private readonly disconnectedListeners = new Map<string, () => void>();
  private readonly reconnectListeners = new Map<string, () => void>();
  private readonly failureListeners = new Map<string, (err: unknown) => void>();
  private readonly noticeListeners = new Map<string, (reason: string) => void>();
  private readonly statusListeners = new Set<StatusListener>();

  private readonly logger = inject(LOGGER_SERVICE);
  private readonly errorService = inject(ConnectionErrorService);
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly reconnectionService = inject(ReconnectionService);

  async connectAsync(
    channelId: string,
    account?: { username: string; accessToken: string }
  ): Promise<void> {
    const normalizedChannel = normalizeChannelId("twitch", channelId);
    if (!normalizedChannel || this.clientsByChannel.has(normalizedChannel)) {
      return;
    }

    this.emitStatus(normalizedChannel, "connecting");

    this.logger.info("Connecting to", {
      source: "TwitchConnectionService",
      normalizedChannel,
      account: account ? { username: account.username, hasToken: !!account.accessToken } : "none",
    });

    const client = new tmi.Client({
      options: {
        skipUpdatingEmotesets: true,
      },
      channels: [normalizedChannel],
      connection: { reconnect: false, secure: true },
      identity: account?.accessToken
        ? {
            username: account.username.toLowerCase(),
            password: `oauth:${account.accessToken}`,
          }
        : undefined,
    });

    const connectedListener = () => {
      this.emitStatus(normalizedChannel, "connected");
      this.errorService.clearError(normalizedChannel);
      this.reconnectionService.clearGap(normalizedChannel);
    };
    client.on("connected", connectedListener);
    this.connectedListeners.set(normalizedChannel, connectedListener);

    const disconnectedListener = (remoteAddress?: string) => {
      this.logger.warn("Disconnected from Twitch", {
        source: "TwitchConnectionService",
        normalizedChannel,
        remote: remoteAddress,
      });
      this.emitStatus(normalizedChannel, "disconnected");
      this.connectionStateService.clearRoomState(normalizedChannel);
    };
    client.on("disconnected", disconnectedListener);
    this.disconnectedListeners.set(normalizedChannel, disconnectedListener);

    const reconnectListener = () => {
      this.emitStatus(normalizedChannel, "reconnecting");
    };
    client.on("reconnect", reconnectListener);
    this.reconnectListeners.set(normalizedChannel, reconnectListener);

    type TmiClientWithConnectionFailure = tmi.Client & {
      on(event: "connectionfailure", listener: (err: unknown) => void): tmi.Client;
    };

    const failureListener = (err: unknown) => {
      this.logger.error("Connection failure for", err, {
        source: "TwitchConnectionService",
        normalizedChannel,
      });
      this.errorService.reportNetworkTimeout(normalizedChannel, "twitch");
    };
    (client as unknown as TmiClientWithConnectionFailure).on("connectionfailure", failureListener);
    this.failureListeners.set(normalizedChannel, failureListener);

    const noticeListener = (reason: string) => {
      if (reason.includes("ratelimit") || reason.includes("rate limit")) {
        this.errorService.reportRateLimited(normalizedChannel, "twitch");
      }
    };
    client.on("notice", noticeListener);
    this.noticeListeners.set(normalizedChannel, noticeListener);

    void client.connect();
    this.clientsByChannel.set(normalizedChannel, client);
  }

  disconnect(channelId: string): void {
    const normalizedChannel = normalizeChannelId("twitch", channelId);
    const client = this.clientsByChannel.get(normalizedChannel);

    if (client) {
      const connectedListener = this.connectedListeners.get(normalizedChannel);
      const disconnectedListener = this.disconnectedListeners.get(normalizedChannel);
      const reconnectListener = this.reconnectListeners.get(normalizedChannel);
      const failureListener = this.failureListeners.get(normalizedChannel);
      const noticeListener = this.noticeListeners.get(normalizedChannel);

      if (connectedListener) client.removeListener("connected", connectedListener);
      if (disconnectedListener) client.removeListener("disconnected", disconnectedListener);
      if (reconnectListener) client.removeListener("reconnect", reconnectListener);
      if (failureListener) {
        type TmiClientWithConnectionFailure = tmi.Client & {
          removeListener(event: "connectionfailure", listener: (err: unknown) => void): tmi.Client;
        };
        (client as unknown as TmiClientWithConnectionFailure).removeListener(
          "connectionfailure",
          failureListener
        );
      }
      if (noticeListener) client.removeListener("notice", noticeListener);

      this.connectedListeners.delete(normalizedChannel);
      this.disconnectedListeners.delete(normalizedChannel);
      this.reconnectListeners.delete(normalizedChannel);
      this.failureListeners.delete(normalizedChannel);
      this.noticeListeners.delete(normalizedChannel);

      void client.disconnect();
      this.clientsByChannel.delete(normalizedChannel);
    }

    this.emitStatus(normalizedChannel, "disconnected");
  }

  getClient(channelId: string): tmi.Client | undefined {
    const normalizedChannel = normalizeChannelId("twitch", channelId);
    return this.clientsByChannel.get(normalizedChannel);
  }

  hasClient(channelId: string): boolean {
    const normalizedChannel = normalizeChannelId("twitch", channelId);
    return this.clientsByChannel.has(normalizedChannel);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  reconnectChannel(channelId: string): void {
    const normalizedChannel = normalizeChannelId("twitch", channelId);
    if (!this.clientsByChannel.has(normalizedChannel)) {
      return;
    }

    this.logger.info("Reconnecting channel", {
      source: "TwitchConnectionService",
      normalizedChannel,
      withNewToken: true,
    });
    this.disconnect(normalizedChannel);
  }

  private emitStatus(channelId: string, status: TwitchConnectionStatus): void {
    for (const listener of this.statusListeners) {
      listener(channelId, status);
    }
  }
}
