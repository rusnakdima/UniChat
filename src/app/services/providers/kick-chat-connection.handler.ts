import { inject } from "@angular/core";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { ReconnectionManager } from "@utils/reconnection-manager.util";
import { normalizeChannelId } from "@utils/channel-normalization.util";
import { KickChatEventMapper } from "@services/providers/kick-chat-event.mapper";
import { KickChannelInfo } from "@models/platform-api.model";
import { RECONNECTION_BASE_DELAY_MS, RECONNECTION_MAX_DELAY_MS } from "@shared/utils/constants";

export class KickChatConnectionHandler {
  readonly platform = "kick" as const;

  private static readonly MAX_CHANNEL_INFO_CACHE = 50;
  private static readonly CHANNEL_INFO_TTL_MS = 30 * 60 * 1000;

  private readonly socketByChannel = new Map<string, WebSocket>();
  private readonly channelInfoByChannel = new Map<
    string,
    { info: KickChannelInfo; timestamp: number }
  >();
  private readonly reconnectTimerByChannel = new Map<string, number>();
  private readonly reconnectManagers = new Map<string, ReconnectionManager>();
  private accessToken: string | null = null;

  private readonly errorService = inject(ConnectionErrorService);
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly kickChatEventMapper = inject(KickChatEventMapper);

  connectedChannels = new Set<string>();

  private channelInfoCacheCleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.channelInfoByChannel) {
      if (now - value.timestamp > KickChatConnectionHandler.CHANNEL_INFO_TTL_MS) {
        this.channelInfoByChannel.delete(key);
      }
    }
    if (this.channelInfoByChannel.size > KickChatConnectionHandler.MAX_CHANNEL_INFO_CACHE) {
      const entriesToDelete =
        this.channelInfoByChannel.size - KickChatConnectionHandler.MAX_CHANNEL_INFO_CACHE;
      const keysToDelete = Array.from(this.channelInfoByChannel.keys()).slice(0, entriesToDelete);
      for (const key of keysToDelete) {
        this.channelInfoByChannel.delete(key);
      }
    }
  }

  connect(channelId: string, accessToken?: string): void {
    const normalizedChannel = normalizeChannelId("kick", channelId);
    if (!normalizedChannel || this.connectedChannels.has(normalizedChannel)) {
      return;
    }

    if (accessToken) {
      this.accessToken = accessToken;
    }
    this.connectedChannels.add(normalizedChannel);
    void this.startLiveSocket(normalizedChannel);
  }

  disconnect(channelId: string): void {
    const normalizedChannel = normalizeChannelId("kick", channelId);
    this.connectedChannels.delete(normalizedChannel);
    const socket = this.socketByChannel.get(normalizedChannel);
    if (socket) {
      socket.close();
      this.socketByChannel.delete(normalizedChannel);
    }
    this.channelInfoByChannel.delete(normalizedChannel);
    const reconnectTimer = this.reconnectTimerByChannel.get(normalizedChannel);
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
      this.reconnectTimerByChannel.delete(normalizedChannel);
    }
    this.reconnectManagers.delete(normalizedChannel);
  }

  reconnectChannel(channelId: string): void {
    const normalizedChannel = normalizeChannelId("kick", channelId);
    if (!this.connectedChannels.has(normalizedChannel)) {
      return;
    }

    this.logger.info("Reconnecting channel with new token", {
      source: "KickChatService",
      channel: normalizedChannel,
    });
    this.channelInfoByChannel.delete(normalizedChannel);
    this.reconnectManagers.delete(normalizedChannel);
    this.disconnect(normalizedChannel);
    this.connect(normalizedChannel);
  }

  private openSocket(channelSlug: string, chatroomId: number): void {
    this.logger.debug("Opening WebSocket connection for channel", {
      source: "KickChatService",
      channel: channelSlug,
      chatroomId,
    });

    const socket = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0"
    );
    this.socketByChannel.set(channelSlug, socket);

    socket.addEventListener("open", () => {
      this.logger.debug("Connection opened, subscribing to channel", {
        source: "KickChatService",
        channel: `chatrooms.${chatroomId}.v2`,
      });
      socket.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: {
            channel: `chatrooms.${chatroomId}.v2`,
          },
        })
      );
    });

    socket.addEventListener("message", (event) => {
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      const data = String(event.data ?? "");
      this.handleSocketMessage(channelSlug, data);
    });

    socket.addEventListener("error", (event) => {
      this.logger.error("WebSocket error", event, {
        source: "KickChatService",
        channel: channelSlug,
      });
      this.errorService.reportWebSocketError(channelSlug, "kick", true);
    });

    socket.addEventListener("close", (event) => {
      this.logger.warn("WebSocket closed", {
        source: "KickChatService",
        channel: channelSlug,
        code: event.code,
        reason: event.reason,
      });
      this.socketByChannel.delete(channelSlug);
      if (this.connectedChannels.has(channelSlug)) {
        this.scheduleReconnect(channelSlug);
      }
    });
  }

  private handleSocketMessage(channelSlug: string, rawData: string): void {
    let parsed: { event?: string; data?: unknown } | undefined;
    try {
      parsed = JSON.parse(rawData) as { event?: string; data?: unknown };
    } catch {
      return;
    }

    if (parsed?.event !== "App\\Events\\ChatMessageEvent") {
      return;
    }

    let payload: Record<string, unknown> | undefined;
    if (typeof parsed.data === "string") {
      try {
        payload = JSON.parse(parsed.data) as Record<string, unknown>;
      } catch {
        this.logger.error("Failed to parse data payload", null, { source: "KickChatService" });
        return;
      }
    } else if (parsed.data && typeof parsed.data === "object") {
      payload = parsed.data as Record<string, unknown>;
    }

    if (!payload) {
      this.logger.error("No payload found", null, { source: "KickChatService" });
      return;
    }

    this.logger.debug("Processing chat event payload", { source: "KickChatService" });
    this.onChatMessage?.(channelSlug, payload);
    this.logger.debug("Message processing complete", { source: "KickChatService" });
  }

  onChatMessage?: (channelSlug: string, payload: Record<string, unknown>) => void;

  private scheduleReconnect(channelSlug: string): void {
    if (!this.connectedChannels.has(channelSlug) || this.reconnectTimerByChannel.has(channelSlug)) {
      return;
    }

    let manager = this.reconnectManagers.get(channelSlug);
    if (!manager) {
      manager = new ReconnectionManager({
        maxRetries: 10,
        baseDelayMs: RECONNECTION_BASE_DELAY_MS,
        maxDelayMs: RECONNECTION_MAX_DELAY_MS,
        jitterPercentage: 0.2,
      });
      this.reconnectManagers.set(channelSlug, manager);
    }

    if (!manager.shouldRetry()) {
      return;
    }

    const delay = manager.onConnectionFailed();

    this.logger.debug("Scheduling reconnect", {
      source: "KickChatService",
      channel: channelSlug,
      attempt: manager.getState().attempts,
      delayMs: Math.round(delay),
    });

    const timerId = window.setTimeout(() => {
      this.reconnectTimerByChannel.delete(channelSlug);
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      void this.startLiveSocket(channelSlug);
    }, delay);

    this.reconnectTimerByChannel.set(channelSlug, timerId);
  }

  async startLiveSocket(channelSlug: string): Promise<void> {
    let manager = this.reconnectManagers.get(channelSlug);
    if (!manager) {
      manager = new ReconnectionManager({
        maxRetries: 10,
        baseDelayMs: RECONNECTION_BASE_DELAY_MS,
        maxDelayMs: RECONNECTION_MAX_DELAY_MS,
        jitterPercentage: 0.2,
      });
      this.reconnectManagers.set(channelSlug, manager);
    }
    manager.onSuccessfulConnection();

    this.channelInfoCacheCleanup();

    try {
      const channelInfo = await this.fetchChannelInfo(channelSlug);
      if (!channelInfo) {
        this.logger.error("No channel info returned", null, {
          source: "KickChatService",
          channel: channelSlug,
        });
        this.errorService.reportChannelNotFound(channelSlug, "kick");
        return;
      }
      this.logger.info("Got channel info", {
        source: "KickChatService",
        channel: channelSlug,
        chatroomId: channelInfo.chatroomId,
      });
      this.channelInfoByChannel.set(channelSlug, { info: channelInfo, timestamp: Date.now() });
      await this.fetchKickRecentMessagesRest(channelSlug, channelInfo.chatroomId);
      if (!this.connectedChannels.has(channelSlug)) {
        this.logger.warn("Channel disconnected during setup", {
          source: "KickChatService",
          channel: channelSlug,
        });
        return;
      }
      this.logger.info("Opening WebSocket", { source: "KickChatService", channel: channelSlug });
      this.openSocket(channelSlug, channelInfo.chatroomId);
    } catch (error) {
      const mgr = this.reconnectManagers.get(channelSlug);
      const attempts = mgr?.getState().attempts ?? 0;

      this.logger.error("Failed to connect", error, {
        source: "KickChatService",
        channel: channelSlug,
        attempt: attempts,
      });
      this.errorService.reportNetworkError(
        channelSlug,
        "Failed to connect to Kick chat. Retrying...",
        true
      );
      this.scheduleReconnect(channelSlug);
    }
  }

  private async fetchChannelInfo(channelSlug: string): Promise<KickChannelInfo | null> {
    const cached = this.channelInfoByChannel.get(channelSlug);
    if (cached && Date.now() - cached.timestamp <= KickChatConnectionHandler.CHANNEL_INFO_TTL_MS) {
      return cached.info;
    }

    this.channelInfoCacheCleanup();

    try {
      return await this.fetchChannelInfoRest(channelSlug, this.accessToken);
    } catch {
      return null;
    }
  }

  async fetchChannelInfoRest(
    channelSlug: string,
    accessToken: string | null
  ): Promise<KickChannelInfo> {
    const { invoke } = await import("@tauri-apps/api/core");
    const cached = this.channelInfoByChannel.get(channelSlug);
    if (cached && Date.now() - cached.timestamp <= KickChatConnectionHandler.CHANNEL_INFO_TTL_MS) {
      return cached.info;
    }

    this.channelInfoCacheCleanup();

    try {
      const channelInfo = await invoke<KickChannelInfo>("kickFetchChatroomId", {
        channelSlug,
        accessToken,
      });
      this.logger.info("Fetched channel info", {
        source: "KickChatService",
        channel: channelSlug,
        channelInfo,
      });
      if (!channelInfo.chatroomId) {
        this.logger.error("Missing chatroom ID", null, {
          source: "KickChatService",
          channel: channelSlug,
        });
        this.errorService.reportChannelNotFound(channelSlug, "kick");
        throw new Error("missing kick chatroom id");
      }
      this.channelInfoByChannel.set(channelSlug, { info: channelInfo, timestamp: Date.now() });
      return channelInfo;
    } catch (error) {
      const message = String(error ?? "");
      this.logger.error("fetchChannelInfo failed", error, {
        source: "KickChatService",
        channel: channelSlug,
      });
      if (message.includes("404") || message.includes("not found")) {
        this.errorService.reportChannelNotFound(channelSlug, "kick");
      } else if (
        message.includes("401") ||
        message.includes("403") ||
        message.includes("authentication")
      ) {
        this.errorService.reportNetworkError(
          channelSlug,
          "Kick API requires authentication. Some features may be limited.",
          false
        );
        throw new Error(`Kick API unavailable: ${message}`);
      } else if (message.includes("500")) {
        if (cached) {
          this.logger.warn("Using cached channel info", {
            source: "KickChatService",
            channel: channelSlug,
          });
          return cached.info;
        }
        this.errorService.reportNetworkError(channelSlug, "Kick API temporarily unavailable");
      } else {
        this.errorService.reportNetworkError(channelSlug, "Failed to fetch channel info");
      }
      throw error;
    }
  }

  private async fetchKickRecentMessagesRest(
    channelSlug: string,
    chatroomId: number
  ): Promise<void> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const payloadRaw = await invoke<string>("kickFetchRecentMessages", {
        channelSlug,
        chatroomId,
      });
      const payload = JSON.parse(payloadRaw);
      const messages = this.extractHistoryMessages(payload);
      for (const message of messages.reverse()) {
        this.onChatMessage?.(channelSlug, message);
      }
    } catch {}
  }

  private extractHistoryMessages(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === "object"
      );
    }

    if (!payload || typeof payload !== "object") {
      return [];
    }

    const rows =
      (payload as Record<string, unknown>)["data"] ??
      (payload as Record<string, unknown>)["messages"];
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === "object"
    );
  }

  getChannelInfo(channelSlug: string): KickChannelInfo | undefined {
    return this.channelInfoByChannel.get(channelSlug)?.info;
  }
}
