/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { ChatMessageEmote } from "@models/chat.model";

/**
 * Kick chat emote parsing — bracket tokens and optional API position metadata.
 */
@Injectable({
  providedIn: "root",
})
export class KickEmotesService {
  /** Kick serializes native emotes in `content` as `[emote:1730834:emojiYay]`. */
  private static readonly KICK_EMOTE_BRACKET = /\[emote:([^:\]]+):([^\]]*)\]/g;

  private static readonly kickEmoteUrl = (emoteId: string) =>
    `https://files.kick.com/emotes/${encodeURIComponent(emoteId)}/fullsize`;

  extractBracketEmotes(content: string): ChatMessageEmote[] {
    if (!content) {
      return [];
    }
    const re = new RegExp(KickEmotesService.KICK_EMOTE_BRACKET.source, "g");
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
        url: KickEmotesService.kickEmoteUrl(emoteId),
      });
    }
    return out;
  }

  mergeEmoteRanges(primary: ChatMessageEmote[], secondary: ChatMessageEmote[]): ChatMessageEmote[] {
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
  extractEmotesFromApi(content: string, rawEmotes: unknown): ChatMessageEmote[] {
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
          url: KickEmotesService.kickEmoteUrl(emoteId),
        });
      }
    }
    return out.sort((left, right) => left.start - right.start);
  }

  buildEmotesForMessage(content: string, payloadEmotes: unknown): ChatMessageEmote[] {
    const fromBrackets = this.extractBracketEmotes(content);
    const fromApi = this.extractEmotesFromApi(content, payloadEmotes);
    return this.mergeEmoteRanges(fromBrackets, fromApi);
  }
}
