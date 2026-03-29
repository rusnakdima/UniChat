/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessageEmote } from "@models/chat.model";

/* services */
import { KickEmotesService } from "@services/providers/kick-emotes.service";

export interface KickMappedChatEvent {
  author: string;
  sourceUserId: string;
  content: string;
  sourceMessageId: string;
  badges: string[];
  timestamp: string | undefined;
  authorAvatarUrl: string | undefined;
  emotes: ChatMessageEmote[];
  previewBase: string;
}

@Injectable({
  providedIn: "root",
})
export class KickChatEventMapper {
  private readonly kickEmotes = inject(KickEmotesService);

  mapChatEventPayload(payload: Record<string, unknown>): KickMappedChatEvent | null {
    const sender = (payload["sender"] as Record<string, unknown> | undefined) ?? {};
    const author = String(sender["username"] ?? "KickUser");
    const sourceUserId = String(sender["id"] ?? author);
    const content = String(payload["content"] ?? "");
    if (!content.trim()) {
      return null;
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

    const emotes = this.kickEmotes.buildEmotesForMessage(content, payload["emotes"]);
    const previewBase = content.trim();

    const createdRaw = payload["created_at"];
    let timestamp: string | undefined;
    if (typeof createdRaw === "string" && createdRaw.trim()) {
      const parsed = new Date(createdRaw);
      if (!Number.isNaN(parsed.getTime())) {
        timestamp = parsed.toISOString();
      }
    }

    const authorAvatarUrl = sender["profile_pic"] as string | undefined;

    return {
      author,
      sourceUserId,
      content,
      sourceMessageId,
      badges: badges.filter(Boolean),
      timestamp,
      authorAvatarUrl,
      emotes,
      previewBase,
    };
  }
}
