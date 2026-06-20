import { Injectable } from "@angular/core";
import { ChatChannel } from "@services/data/chat-list.service";

export interface ChannelRef {
  platform: string;
  channelId: string;
  username: string;
  providerChannelId?: string;
}

@Injectable({ providedIn: "root" })
export class ChannelRefService {
  buildChannelRef(platform: string, channelId: string, username: string): ChannelRef {
    return { platform, channelId, username };
  }
  parseChannelRef(ref: string): ChannelRef | null {
    return null;
  }
  toChannelRef(platform: string, channel: string): ChannelRef {
    return { platform, channelId: channel, username: channel };
  }
  findChannelByRef(ref: ChannelRef): string {
    return ref.channelId;
  }
  migrateLegacyChannelRefs(): void {}
}

export function buildChannelRef(platform: string, channelId: string, username?: string): string {
  return `${platform}:${channelId}`;
}

export function parseChannelRef(ref: string): ChannelRef | null {
  const [platform, channelId] = ref.split(":");
  if (!platform || !channelId) return null;
  return { platform, channelId, username: channelId };
}

export function findChannelByRef(ref: ChannelRef): string {
  return ref.channelId;
}
export function findChannelInArray(
  channels: ChatChannel[],
  channelId: string
): ChatChannel | undefined {
  return channels.find((ch) => ch.channelId === channelId);
}
export function toChannelRef(platform: string, channel: string): ChannelRef {
  return { platform, channelId: channel, username: channel };
}
export function toChannelRefFromChannel(channel: ChatChannel): ChannelRef {
  return {
    platform: channel.platform,
    channelId: channel.channelId,
    username: channel.channelName,
  };
}
export function migrateLegacyChannelRefs(
  channelIds: string[],
  visibleChannels: ChatChannel[]
): string[] {
  if (!channelIds || channelIds.length === 0) {
    return [];
  }
  return channelIds;
}
