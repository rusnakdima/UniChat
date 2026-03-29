import tmi from "tmi.js";

/**
 * Parser for Robotty recent-messages IRC lines (PRIVMSG with Twitch IRC tags).
 */

export function extractIrcTagMapFromLine(line: string): Record<string, string> | null {
  if (!line.startsWith("@")) {
    return null;
  }
  const sep = line.indexOf(" :");
  if (sep === -1) {
    return null;
  }
  const tagString = line.slice(1, sep);
  const tagMap: Record<string, string> = {};
  for (const part of tagString.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    tagMap[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return tagMap;
}

export function rawIrcTagsToUserstate(
  raw: Record<string, string>,
  fallbackNick: string
): tmi.ChatUserstate {
  const badges: tmi.Badges = {};
  if (raw["badges"]) {
    for (const seg of raw["badges"].split(",")) {
      if (!seg) {
        continue;
      }
      const slash = seg.indexOf("/");
      if (slash === -1) {
        badges[seg] = "1";
      } else {
        badges[seg.slice(0, slash)] = seg.slice(slash + 1);
      }
    }
  }

  const emotes: { [emoteId: string]: string[] } = {};
  if (raw["emotes"]) {
    for (const segment of raw["emotes"].split("/")) {
      if (!segment) {
        continue;
      }
      const colon = segment.indexOf(":");
      if (colon === -1) {
        continue;
      }
      const id = segment.slice(0, colon);
      const ranges = segment
        .slice(colon + 1)
        .split(",")
        .filter(Boolean);
      if (ranges.length) {
        emotes[id] = ranges;
      }
    }
  }

  const displayName = raw["display-name"];
  const login =
    raw["login"]?.trim() || fallbackNick.trim().toLowerCase() || displayName?.toLowerCase();

  return {
    "display-name": displayName,
    "user-id": raw["user-id"],
    username: login,
    id: raw["id"],
    "room-id": raw["room-id"],
    "reply-parent-msg-id": raw["reply-parent-msg-id"],
    color: raw["color"],
    "tmi-sent-ts": raw["tmi-sent-ts"],
    badges,
    emotes,
  } as tmi.ChatUserstate;
}

export function parseRecentMessagesPrivmsg(
  line: string,
  expectedChannel: string
): { tags: tmi.ChatUserstate; message: string } | null {
  const privIdx = line.indexOf(" PRIVMSG ");
  if (privIdx === -1 || !line.startsWith("@")) {
    return null;
  }
  const sep = line.indexOf(" :");
  if (sep === -1 || sep > privIdx) {
    return null;
  }
  const rest = line.slice(sep + 2);
  const privmsgIdx = rest.indexOf(" PRIVMSG ");
  if (privmsgIdx === -1) {
    return null;
  }
  const nickPart = rest.slice(0, privmsgIdx);
  const nick = nickPart.includes("!") ? nickPart.slice(0, nickPart.indexOf("!")) : nickPart;
  const afterPriv = rest.slice(privmsgIdx + " PRIVMSG ".length).trimStart();
  if (!afterPriv.startsWith("#")) {
    return null;
  }
  const spaceAfterChan = afterPriv.indexOf(" ");
  if (spaceAfterChan === -1) {
    return null;
  }
  const chan = afterPriv.slice(1, spaceAfterChan).toLowerCase();
  if (chan !== expectedChannel.toLowerCase()) {
    return null;
  }
  let message = afterPriv.slice(spaceAfterChan + 1);
  if (message.startsWith(":")) {
    message = message.slice(1);
  }

  const tagMap = extractIrcTagMapFromLine(line);
  if (!tagMap) {
    return null;
  }

  const tags = rawIrcTagsToUserstate(tagMap, nick);
  return { tags, message };
}
