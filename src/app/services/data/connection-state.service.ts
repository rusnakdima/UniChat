import { Injectable, computed, inject, signal } from "@angular/core";
import {
  ChannelConnection,
  PlatformCapabilities,
  PlatformStatus,
  PlatformType,
  ChannelConnectionError,
  RoomState,
} from "@models/chat.model";
import { getProviderCapabilities } from "@helpers/chat.helper";
import { ChatListService } from "@services/data/chat-list.service";
import { AuthorizationService } from "@services/features/authorization.service";

/**
 * Connection State Service - Channel Connection Status
 *
 * Responsibility: Manages connection status (disconnected/connecting/connected) per channel.
 * Tracks latency, viewer count, platform capabilities, and errors for each connection.
 *
 * Source of Truth Hierarchy:
 * 1. ChatStorageService - Primary message storage (owns the data)
 * 2. ChatStateService - Computed state (derived from storage)
 * 3. ChatStateManagerService - Connection tracking (session state)
 * 4. ConnectionStateService - Connection status per channel <-- THIS SERVICE
 *
 * @see ChatStorageService for data persistence
 * @see ChatStateService for computed message state
 * @see ChatStateManagerService for session-level connection tracking
 */
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
        error: conn?.error,
      };
    });
  });

  readonly connectionMap = this.connectionsSignal.asReadonly();

  /**
   * Get error for a specific channel
   */
  getChannelError(channelId: string): ChannelConnectionError | undefined {
    return this.connectionsSignal()[channelId]?.error;
  }

  /**
   * Check if channel has an error
   */
  hasError(channelId: string): boolean {
    return !!this.connectionsSignal()[channelId]?.error;
  }

  /**
   * Clear error for a channel (called when connection recovers)
   */
  clearError(channelId: string): void {
    this.updateConnection(channelId, { error: undefined });
  }

  /**
   * Report an error for a channel connection
   */
  reportError(channelId: string, error: Partial<ChannelConnectionError>): void {
    const existingError = this.connectionsSignal()[channelId]?.error;
    this.updateConnection(channelId, {
      error: {
        code: error.code ?? "unknown",
        message: error.message ?? "An unknown error occurred",
        occurredAt: error.occurredAt ?? new Date().toISOString(),
        isRecoverable: error.isRecoverable ?? true,
        ...(existingError ?? {}),
      },
    });
  }

  /**
   * Update room state for a channel (slow mode, followers-only, etc.)
   */
  updateRoomState(channelId: string, roomState: Partial<RoomState>): void {
    const current = this.connectionsSignal()[channelId];
    this.updateConnection(channelId, {
      roomState: {
        isSlowMode: false,
        isFollowersOnly: false,
        isSubscribersOnly: false,
        isEmotesOnly: false,
        isR9k: false,
        ...current?.roomState,
        ...roomState,
      },
    });
  }

  /**
   * Get room state for a channel
   */
  getRoomState(channelId: string): RoomState | undefined {
    return this.connectionsSignal()[channelId]?.roomState;
  }

  /**
   * Clear room state (called on disconnect)
   */
  clearRoomState(channelId: string): void {
    this.updateConnection(channelId, { roomState: undefined });
  }

  connectChannel(channelId: string): void {
    const channel = this.findChannel(channelId);

    if (!channel) {
      return;
    }

    const isAuthorized = this.authorizationService.isAuthorized(channel.platform);
    const capabilities = getProviderCapabilities(channel.platform, isAuthorized);

    this.updateConnection(channelId, {
      status: "connecting",
      error: undefined, // Clear error on reconnect attempt
    });

    setTimeout(() => {
      this.updateConnection(channelId, {
        status: "connected",
        latencyMs: Math.floor(Math.random() * 100) + 200,
        viewers: Math.floor(Math.random() * 5000) + 100,
        capabilities,
        error: undefined, // Clear error on successful connection
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
      error: undefined, // Clear error on reconnect attempt
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
        error: undefined, // Clear error on successful reconnect
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
    patch?: Partial<Pick<ChannelConnection, "latencyMs" | "viewers" | "capabilities" | "error">>
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
