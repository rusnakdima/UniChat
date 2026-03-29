/* sys lib */
import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* services */
import { ConnectionErrorService } from "@services/core/connection-error.service";
import { BaseChatProviderService } from "@services/providers/base-chat-provider.service";
import { KickChatEventMapper } from "@services/providers/kick-chat-event.mapper";

/* helpers */
import { createMessageActionState } from "@helpers/chat.helper";
export interface KickUserInfo {
  id: string;
  username: string;
  bio: string;
  profile_pic_url: string;
}

@Injectable({
  providedIn: "root",
})
export class KickChatService extends BaseChatProviderService {
  readonly platform = "kick" as const;

  private readonly socketByChannel = new Map<string, WebSocket>();
  private readonly chatroomIdByChannel = new Map<string, number>();
  private readonly reconnectTimerByChannel = new Map<string, number>();
  private readonly historyNoticeLoggedChannels = new Set<string>();
  private readonly errorService = inject(ConnectionErrorService);
  private readonly kickChatEventMapper = inject(KickChatEventMapper);

  override connect(channelId: string): void {
    const normalizedChannel = channelId.trim().toLowerCase();
    if (!normalizedChannel || this.connectedChannels.has(normalizedChannel)) {
      return;
    }

    this.connectedChannels.add(normalizedChannel);
    void this.startLiveSocket(normalizedChannel);
  }

  override disconnect(channelId: string): void {
    const normalizedChannel = channelId.trim().toLowerCase();
    this.connectedChannels.delete(normalizedChannel);
    const socket = this.socketByChannel.get(normalizedChannel);
    if (socket) {
      socket.close();
      this.socketByChannel.delete(normalizedChannel);
    }
    this.chatroomIdByChannel.delete(normalizedChannel);
    const reconnectTimer = this.reconnectTimerByChannel.get(normalizedChannel);
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer);
      this.reconnectTimerByChannel.delete(normalizedChannel);
    }
    this.historyNoticeLoggedChannels.delete(normalizedChannel);
  }

  protected override getActionStates() {
    return {
      reply: createMessageActionState(
        "reply",
        "disabled",
        "Reply is available only through linked account actions."
      ),
      delete: createMessageActionState(
        "delete",
        "disabled",
        "This channel cannot delete messages."
      ),
    };
  }

  private async startLiveSocket(channelSlug: string): Promise<void> {
    try {
      const chatroomId = await this.fetchChatroomId(channelSlug);
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      this.chatroomIdByChannel.set(channelSlug, chatroomId);
      await this.fetchKickRecentMessagesRest(channelSlug, chatroomId);
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      this.openSocket(channelSlug, chatroomId);
    } catch (error) {
      console.error(`[KickChat] Error starting for ${channelSlug}:`, error);
      this.errorService.reportNetworkError(
        channelSlug,
        "Failed to connect to Kick chat. Retrying...",
        true
      );
      this.scheduleReconnect(channelSlug);
    }
  }

  private openSocket(channelSlug: string, chatroomId: number): void {
    const socket = new WebSocket(
      "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0"
    );
    this.socketByChannel.set(channelSlug, socket);

    socket.addEventListener("open", () => {
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
      console.error(`[KickChat] WebSocket error for ${channelSlug}:`, event);
      this.errorService.reportWebSocketError(channelSlug, "kick", true);
    });

    socket.addEventListener("close", (event) => {
      this.socketByChannel.delete(channelSlug);
      if (this.connectedChannels.has(channelSlug)) {
        this.scheduleReconnect(channelSlug);
      }
    });
  }

  private async fetchChatroomId(channelSlug: string): Promise<number> {
    // Try fetching from the browser context first (has fewer restrictions than server-side)
    try {
      const response = await fetch(`https://kick.com/api/v1/channels/${channelSlug}`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://kick.com/",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { id?: number; chatroom?: { id?: number } };
        const chatroomId = data.chatroom?.id ?? data.id;
        if (chatroomId) {
          return chatroomId;
        }
      } else if (response.status === 404) {
        this.errorService.reportChannelNotFound(channelSlug, "kick");
        throw new Error(`Channel '${channelSlug}' not found on Kick`);
      } else if (response.status === 401 || response.status === 403) {
        // Fall back to Tauri backend command
        console.warn(`[KickChat] Browser fetch failed with ${response.status}, trying backend...`);
      }
    } catch (browserError) {
      console.warn(`[KickChat] Browser fetch failed:`, browserError);
      // Continue to backend fallback
    }

    // Fallback: Try the Tauri backend command
    try {
      const chatroomId = await invoke<number>("kickFetchChatroomId", { channelSlug });
      if (!chatroomId) {
        this.errorService.reportChannelNotFound(channelSlug, "kick");
        throw new Error("missing kick chatroom id");
      }
      return chatroomId;
    } catch (error) {
      const message = String(error ?? "");
      if (message.includes("404") || message.includes("not found")) {
        this.errorService.reportChannelNotFound(channelSlug, "kick");
      } else if (
        message.includes("401") ||
        message.includes("403") ||
        message.includes("authentication")
      ) {
        // For auth errors, provide a more helpful message
        console.warn(
          `[KickChat] API auth error for ${channelSlug}. Kick may require authentication.`
        );
        this.errorService.reportNetworkError(
          channelSlug,
          "Kick API requires authentication. Some features may be limited.",
          false
        );
        // Still throw to allow WebSocket connection attempt with fallback
        throw new Error(`Kick API unavailable: ${message}`);
      } else {
        this.errorService.reportNetworkError(channelSlug, "Failed to fetch channel info");
      }
      throw error;
    }
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
        return;
      }
    } else if (parsed.data && typeof parsed.data === "object") {
      payload = parsed.data as Record<string, unknown>;
    }

    if (!payload) {
      return;
    }

    this.ingestKickChatEventPayload(channelSlug, payload);
  }

  private ingestKickChatEventPayload(channelSlug: string, payload: Record<string, unknown>): void {
    const mapped = this.kickChatEventMapper.mapChatEventPayload(payload);
    if (!mapped) {
      return;
    }

    this.chatStorageService.addMessage(
      channelSlug,
      this.createMessage(channelSlug, {
        id: `msg-${mapped.sourceMessageId}`,
        sourceMessageId: mapped.sourceMessageId,
        sourceUserId: mapped.sourceUserId,
        author: mapped.author,
        text: mapped.content,
        badges: mapped.badges,
        timestamp: mapped.timestamp,
        rawPayload: {
          providerEvent: "chat.message",
          providerChannelId: channelSlug,
          providerUserId: mapped.sourceUserId,
          preview: mapped.previewBase.slice(0, 120),
          emotes: mapped.emotes.length ? mapped.emotes : undefined,
        },
        authorAvatarUrl: mapped.authorAvatarUrl,
      })
    );
  }

  private async fetchKickRecentMessagesRest(
    channelSlug: string,
    chatroomId: number
  ): Promise<void> {
    try {
      const payloadRaw = await invoke<string>("kickFetchRecentMessages", {
        channelSlug,
        chatroomId,
      });
      const payload = JSON.parse(payloadRaw);
      const messages = this.extractHistoryMessages(payload);
      for (const message of messages.reverse()) {
        this.ingestKickChatEventPayload(channelSlug, message);
      }
    } catch {
      // History is optional; live websocket still continues.
    }
  }

  private scheduleReconnect(channelSlug: string): void {
    if (!this.connectedChannels.has(channelSlug) || this.reconnectTimerByChannel.has(channelSlug)) {
      return;
    }
    const timerId = window.setTimeout(() => {
      this.reconnectTimerByChannel.delete(channelSlug);
      if (!this.connectedChannels.has(channelSlug)) {
        return;
      }
      void this.startLiveSocket(channelSlug);
    }, 2500);
    this.reconnectTimerByChannel.set(channelSlug, timerId);
  }

  sendMessage(channelId: string, text: string, accountId?: string): boolean {
    const account = this.authorizationService.getAccountById(accountId);
    if (account?.authStatus !== "authorized" || !account.accessToken) {
      return false;
    }
    void this.sendMessageAsync(channelId, text, account.accessToken);
    return true;
  }

  private async sendMessageAsync(
    channelId: string,
    text: string,
    accessToken: string
  ): Promise<boolean> {
    const normalizedChannel = channelId.trim().toLowerCase();
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    try {
      const chatroomId = await this.fetchChatroomId(normalizedChannel);
      const response = await fetch(`https://kick.com/api/v2/chatrooms/${chatroomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: trimmed,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.warn(`[KickChat] Failed to send message: ${response.status}`, error);
        // Surface error to user via console (could be extended with UI notification)
        throw new Error(`Kick API error ${response.status}: ${error || response.statusText}`);
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[KickChat] Error sending message:", message);
      return false;
    }
  }

  /**
   * Fetch Kick user info (no authentication required)
   * @param username - Kick username
   * @returns User info with profile picture, bio, etc.
   */
  async fetchUserInfo(username: string): Promise<KickUserInfo | null> {
    try {
      // Try browser fetch first
      const response = await fetch(`https://kick.com/api/v1/channels/${username}`, {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://kick.com/",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          user?: { id?: number; username?: string; bio?: string; profile_pic?: string };
        };
        if (data.user) {
          return {
            id: String(data.user.id ?? ""),
            username: data.user.username ?? username,
            bio: data.user.bio ?? "",
            profile_pic_url: data.user.profile_pic ?? "",
          };
        }
      }

      // Fallback to Tauri command
      const userInfo = await invoke<KickUserInfo>("kickFetchUserInfo", { username });
      return userInfo;
    } catch (error) {
      console.warn(`[KickChat] Failed to fetch user info for ${username}:`, error);
      return null;
    }
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
}
