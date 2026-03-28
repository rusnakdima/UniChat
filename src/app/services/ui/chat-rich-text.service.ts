/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { ChatMessage, ChatMessageEmote } from "@models/chat.model";

/* services */
import { normalizeChatLinkHref } from "@services/ui/link-preview.service";
export interface ChatTextSegment {
  type: "text" | "emote" | "link";
  value: string;
  emote?: ChatMessageEmote;
  /** Present when `type === "link"` — safe http(s) URL. */
  href?: string;
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"'()[\]]+|www\.[^\s<>"'()[\]]+/gi;

@Injectable({
  providedIn: "root",
})
export class ChatRichTextService {
  buildSegments(message: ChatMessage): ChatTextSegment[] {
    const text = message.text ?? "";
    const emoteChunks = this.buildEmoteSegments(message);
    const out: ChatTextSegment[] = [];

    for (const chunk of emoteChunks) {
      if (chunk.type === "emote") {
        out.push(chunk);
        continue;
      }
      out.push(...this.splitTextWithLinks(chunk.value));
    }

    return out.length ? out : [{ type: "text", value: text }];
  }

  private buildEmoteSegments(message: ChatMessage): ChatTextSegment[] {
    const text = message.text ?? "";
    const emotes = [...(message.rawPayload.emotes ?? [])].sort(
      (left, right) => left.start - right.start
    );
    if (!emotes.length || !text.length) {
      return [{ type: "text", value: text }];
    }

    const segments: ChatTextSegment[] = [];
    let cursor = 0;
    for (const emote of emotes) {
      const start = Math.max(0, emote.start);
      const end = Math.min(text.length - 1, emote.end);
      if (start > cursor) {
        segments.push({ type: "text", value: text.slice(cursor, start) });
      }
      if (end >= start) {
        segments.push({
          type: "emote",
          value: text.slice(start, end + 1),
          emote,
        });
      }
      cursor = end + 1;
    }

    if (cursor < text.length) {
      segments.push({ type: "text", value: text.slice(cursor) });
    }

    return segments.length ? segments : [{ type: "text", value: text }];
  }

  private splitTextWithLinks(text: string): ChatTextSegment[] {
    if (!text) {
      return [];
    }

    const segments: ChatTextSegment[] = [];
    let lastIndex = 0;
    URL_IN_TEXT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_IN_TEXT.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      if (start > lastIndex) {
        segments.push({ type: "text", value: text.slice(lastIndex, start) });
      }
      const href = normalizeChatLinkHref(raw);
      if (href) {
        segments.push({ type: "link", value: raw, href });
      } else {
        segments.push({ type: "text", value: raw });
      }
      lastIndex = start + raw.length;
    }

    if (lastIndex < text.length) {
      segments.push({ type: "text", value: text.slice(lastIndex) });
    }

    return segments.length ? segments : [{ type: "text", value: text }];
  }
}
