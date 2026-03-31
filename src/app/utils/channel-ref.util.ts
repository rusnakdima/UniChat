import { ChatChannel, PlatformType } from "@models/chat.model";

export type ChannelRef = `${PlatformType}:${string}`;

export function buildChannelRef(platform: PlatformType, providerChannelId: string): ChannelRef {
  return `${platform}:${providerChannelId}` as ChannelRef;
}

export function parseChannelRef(channelRef: string): {
  platform: PlatformType;
  providerChannelId: string;
} | null {
  const separatorIndex = channelRef.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const platform = channelRef.slice(0, separatorIndex);
  const providerChannelId = channelRef.slice(separatorIndex + 1).trim();
  if (!providerChannelId) {
    return null;
  }

  if (platform === "twitch" || platform === "kick" || platform === "youtube") {
    return { platform, providerChannelId };
  }

  return null;
}

export function isChannelRef(value: string): value is ChannelRef {
  return parseChannelRef(value) !== null;
}

export function toChannelRef(channel: Pick<ChatChannel, "platform" | "channelId">): ChannelRef {
  return buildChannelRef(channel.platform, channel.channelId);
}

export function migrateLegacyChannelRefs(
  values: string[] | null | undefined,
  channels: ChatChannel[]
): ChannelRef[] | undefined {
  if (values == null) {
    return undefined;
  }

  if (values.length === 0) {
    return [];
  }

  const migrated = new Set<ChannelRef>();

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const directRef = parseChannelRef(normalized);
    if (directRef) {
      migrated.add(buildChannelRef(directRef.platform, directRef.providerChannelId));
      continue;
    }

    if (normalized.startsWith("ch-")) {
      const match = channels.find((channel) => channel.id === normalized);
      if (match) {
        migrated.add(toChannelRef(match));
      }
      continue;
    }

    const exactMatches = channels.filter(
      (channel) =>
        channel.channelId === normalized ||
        channel.channelName.toLowerCase() === normalized.toLowerCase()
    );

    if (exactMatches.length === 1) {
      migrated.add(toChannelRef(exactMatches[0]));
    }
  }

  return [...migrated];
}

export function findChannelByRef(
  channels: ChatChannel[],
  channelRef: string
): ChatChannel | undefined {
  const parsed = parseChannelRef(channelRef);
  if (!parsed) {
    return undefined;
  }

  return channels.find(
    (channel) =>
      channel.platform === parsed.platform && channel.channelId === parsed.providerChannelId
  );
}
