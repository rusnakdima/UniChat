import { Injectable } from "@angular/core";
import { createMessageActionState } from "@helpers/chat.helper";
import { ChatMessageEmote } from "@models/chat.model";
import {
  BaseChatProviderService,
  MockMessageTemplate,
} from "@services/providers/base-chat-provider.service";
import { invoke } from "@tauri-apps/api/core";

@Injectable({
  providedIn: "root",
})
export class KickChatService extends BaseChatProviderService {
  readonly platform = "kick" as const;

  /** Kick serializes native emotes in `content` as `[emote:1730834:emojiYay]`. */
  private static readonly KICK_EMOTE_BRACKET = /\[emote:([^:\]]+):([^\]]*)\]/g;

  private readonly socketByChannel = new Map<string, WebSocket>();
  private readonly chatroomIdByChannel = new Map<string, number>();
  private readonly reconnectTimerByChannel = new Map<string, number>();
  private readonly historyNoticeLoggedChannels = new Set<string>();

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

  protected getActionStates() {
    const account = this.authorizationService.getAccount("kick");
    const canReply = account?.authStatus === "authorized";
    return {
      reply: createMessageActionState(
        "reply",
        canReply ? "available" : "disabled",
        canReply ? undefined : "Need Kick account authorized to reply."
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
    });

    socket.addEventListener("close", (event) => {
      this.socketByChannel.delete(channelSlug);
      if (this.connectedChannels.has(channelSlug)) {
        this.scheduleReconnect(channelSlug);
      }
    });
  }

  private async fetchChatroomId(channelSlug: string): Promise<number> {
    const chatroomId = await invoke<number>("kickFetchChatroomId", { channelSlug });
    if (!chatroomId) {
      throw new Error("missing kick chatroom id");
    }
    return chatroomId;
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
    const sender = (payload["sender"] as Record<string, unknown> | undefined) ?? {};
    const author = String(sender["username"] ?? "KickUser");
    const sourceUserId = String(sender["id"] ?? author);
    const content = String(payload["content"] ?? "");
    if (!content.trim()) {
      return;
    }
    const sourceMessageId = String(
      payload["id"] ?? `kick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    const badges: string[] = [];
    const identity = sender["identity"] as Record<string, unknown> | undefined;
    const senderBadges = identity?.["badges"] as unknown[] | undefined;
    if (Array.isArray(senderBadges)) {
      for (const role of senderBadges) {
        if (role && typeof role === "object" && "type" in role) {
          badges.push(String((role as { type?: unknown }).type ?? ""));
        }
      }
    }

    const fromBrackets = this.extractKickBracketEmotes(content);
    const fromApi = this.extractKickEmotesFromApi(content, payload["emotes"]);
    const emotes = this.mergeKickEmoteRanges(fromBrackets, fromApi);
    const previewBase = content.trim();

    const createdRaw = payload["created_at"];
    let timestamp: string | undefined;
    if (typeof createdRaw === "string" && createdRaw.trim()) {
      const parsed = new Date(createdRaw);
      if (!Number.isNaN(parsed.getTime())) {
        timestamp = parsed.toISOString();
      }
    }

    // Build author avatar URL for Kick
    const authorAvatarUrl = sender["profile_pic"] as string | undefined;

    this.chatStorageService.addMessage(
      channelSlug,
      this.createMessage(channelSlug, {
        id: `msg-${sourceMessageId}`,
        sourceMessageId,
        sourceUserId,
        author,
        text: content,
        badges: badges.filter(Boolean),
        timestamp,
        rawPayload: {
          providerEvent: "chat.message",
          providerChannelId: channelSlug,
          providerUserId: sourceUserId,
          preview: previewBase.slice(0, 120),
          emotes: emotes.length ? emotes : undefined,
        },
        authorAvatarUrl,
      })
    );
  }

  private async fetchKickRecentMessagesRest(
    channelSlug: string,
    chatroomId: number
  ): Promise<void> {
    // Kick history endpoints are blocked without auth/cookies.
    // No-auth mode intentionally relies on live socket tracking + locally persisted history.
    void chatroomId;
  }

  private extractKickBracketEmotes(content: string): ChatMessageEmote[] {
    if (!content) {
      return [];
    }
    const re = new RegExp(KickChatService.KICK_EMOTE_BRACKET.source, "g");
    const out: ChatMessageEmote[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const emoteId = String(m[1] ?? "").trim();
      const codeRaw = String(m[2] ?? "").trim();
      if (!emoteId) {
        continue;
      }
      const code = codeRaw || emoteId;
      const full = m[0];
      const start = m.index;
      const end = start + full.length - 1;
      out.push({
        provider: "kick",
        id: emoteId,
        code,
        start,
        end,
        url: `https://files.kick.com/emotes/${encodeURIComponent(emoteId)}/fullsize`,
      });
    }
    return out;
  }

  private mergeKickEmoteRanges(
    primary: ChatMessageEmote[],
    secondary: ChatMessageEmote[]
  ): ChatMessageEmote[] {
    const overlaps = (a: ChatMessageEmote, b: ChatMessageEmote) =>
      !(a.end < b.start || b.end < a.start);
    const out = [...primary];
    for (const s of secondary) {
      if (primary.some((p) => overlaps(p, s))) {
        continue;
      }
      out.push(s);
    }
    return out.sort((left, right) => left.start - right.start);
  }

  /**
   * Optional payload metadata: `emotes: { emote_id, positions: { s, e }[] }[]`
   * (indices into `content`, inclusive — same convention as Twitch IRC tags).
   */
  private extractKickEmotesFromApi(content: string, rawEmotes: unknown): ChatMessageEmote[] {
    if (!Array.isArray(rawEmotes) || !content.length) {
      return [];
    }

    const out: ChatMessageEmote[] = [];
    for (const entry of rawEmotes) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const row = entry as Record<string, unknown>;
      const idRaw = row["emote_id"] ?? row["id"];
      if (idRaw === undefined || idRaw === null) {
        continue;
      }
      const emoteId = String(idRaw);
      const rawPositions = row["positions"];
      if (!Array.isArray(rawPositions)) {
        continue;
      }
      for (const pos of rawPositions) {
        if (!pos || typeof pos !== "object") {
          continue;
        }
        const p = pos as Record<string, unknown>;
        const sRaw = p["s"] ?? p["start"];
        const eRaw = p["e"] ?? p["end"];
        const s = typeof sRaw === "number" ? sRaw : Number(sRaw);
        const e = typeof eRaw === "number" ? eRaw : Number(eRaw);
        if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e < s) {
          continue;
        }
        const start = Math.max(0, Math.floor(s));
        const end = Math.min(content.length - 1, Math.floor(e));
        if (end < start) {
          continue;
        }
        const code = content.slice(start, end + 1);
        if (!code) {
          continue;
        }
        out.push({
          provider: "kick",
          id: emoteId,
          code,
          start,
          end,
          url: `https://files.kick.com/emotes/${encodeURIComponent(emoteId)}/fullsize`,
        });
      }
    }
    return out.sort((left, right) => left.start - right.start);
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

  sendMessage(channelId: string, text: string): boolean {
    const account = this.authorizationService.getAccount("kick");
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
}
