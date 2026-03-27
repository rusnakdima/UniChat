import { Injectable, computed, inject, signal } from "@angular/core";
import {
  ChannelConnection,
  PlatformCapabilities,
  PlatformStatus,
  PlatformType,
} from "@models/chat.model";
import { getProviderCapabilities } from "@helpers/chat.helper";
import { ChatListService } from "@services/data/chat-list.service";
import { AuthorizationService } from "@services/features/authorization.service";

@Injectable({
  providedIn: "root",
})
export class ConnectionStateService {
  private readonly chatListService = inject(ChatListService);
  private readonly authorizationService = inject(AuthorizationService);

  private readonly connectionsSignal = signal<Record<string, ChannelConnection>>({});

  readonly connections = computed(() => {
    const channels = this.chatListService.getVisibleChannels();
    return channels.map((channel) => {
      const conn = this.connectionsSignal()[channel.channelId];
      return {
        channelId: channel.channelId,
        platform: channel.platform,
        status: conn?.status ?? ("disconnected" as PlatformStatus),
        latencyMs: conn?.latencyMs ?? 0,
        viewers: conn?.viewers ?? 0,
        capabilities:
          conn?.capabilities ??
          ({
            canListen: false,
            canReply: false,
            canDelete: false,
          } as PlatformCapabilities),
      };
    });
  });

  readonly connectionMap = this.connectionsSignal.asReadonly();

  connectChannel(channelId: string): void {
    const channel = this.findChannel(channelId);

    if (!channel) {
      return;
    }

    const isAuthorized = this.authorizationService.isAuthorized(channel.platform);
    const capabilities = getProviderCapabilities(channel.platform, isAuthorized);

    this.updateConnection(channelId, {
      status: "connecting",
    });

    setTimeout(() => {
      this.updateConnection(channelId, {
        status: "connected",
        latencyMs: Math.floor(Math.random() * 100) + 200,
        viewers: Math.floor(Math.random() * 5000) + 100,
        capabilities,
      });
    }, 500);
  }

  disconnectChannel(channelId: string): void {
    this.updateConnection(channelId, {
      status: "disconnected",
    });
  }

  reconnectChannel(channelId: string): void {
    this.updateConnection(channelId, {
      status: "reconnecting",
    });

    setTimeout(() => {
      const channel = this.findChannel(channelId);

      if (!channel) {
        return;
      }

      const isAuthorized = this.authorizationService.isAuthorized(channel.platform);
      const capabilities = getProviderCapabilities(channel.platform, isAuthorized);

      this.updateConnection(channelId, {
        status: "connected",
        latencyMs: Math.floor(Math.random() * 100) + 200,
        viewers: Math.floor(Math.random() * 5000) + 100,
        capabilities,
      });
    }, 800);
  }

  private updateConnection(channelId: string, patch: Partial<ChannelConnection>): void {
    this.connectionsSignal.update((connections) => {
      const current = connections[channelId] ?? {
        channelId,
        platform: this.findChannel(channelId)?.platform ?? "twitch",
        status: "disconnected" as PlatformStatus,
        latencyMs: 0,
        viewers: 0,
        capabilities: {
          canListen: false,
          canReply: false,
          canDelete: false,
        },
      };

      return {
        ...connections,
        [channelId]: { ...current, ...patch },
      };
    });
  }

  setChannelStatus(
    channelId: string,
    status: PlatformStatus,
    patch?: Partial<Pick<ChannelConnection, "latencyMs" | "viewers" | "capabilities">>
  ): void {
    this.updateConnection(channelId, {
      status,
      ...(patch ?? {}),
    });
  }

  private findChannel(channelId: string) {
    return this.chatListService
      .getChannels()
      .find((channel) => channel.id === channelId || channel.channelId === channelId);
  }
}
