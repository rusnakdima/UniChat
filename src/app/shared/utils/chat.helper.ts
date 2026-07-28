import type { PlatformType, DensityMode, ChatMessage, MessageActionKind, MessageActionStatus } from '@entities/chat.model';

export function generateTimestamp(): string {
  return new Date().toISOString();
}

export function isSafeRemoteImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export function sortBy<T>(items: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

export function groupByField<T>(items: T[], field: keyof T): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  if (field === 'platform') {
    const platforms = ['twitch', 'kick', 'youtube', 'trovo'];
    for (const p of platforms) {
      result[p] = [];
    }
  }
  for (const item of items) {
    const key = String(item[field]);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

export function createChatMessage(
  platform: PlatformType,
  channelId: string,
  options?: Partial<ChatMessage> & { rawPayloadOverride?: Partial<{ providerEvent: string; preview: string }>; customActions?: Partial<{ reply: MessageAction; delete: MessageAction }> }
): ChatMessage {
  const id = options?.id || crypto.randomUUID();
  const defaultProviderEvent = platform === 'twitch' ? 'privmsg' : platform === 'kick' ? 'chat.message' : 'liveChatMessage';
  const rawPayloadOverride = options?.rawPayloadOverride || {};
  const customActions = options?.customActions;
  return {
    id,
    platform,
    sourceMessageId: options?.sourceMessageId || id,
    sourceChannelId: channelId,
    sourceUserId: options?.sourceUserId || `${platform}-user-${Math.random().toString(36).slice(2)}`,
    author: options?.author || 'Anonymous',
    text: options?.text || '',
    timestamp: options?.timestamp || generateTimestamp(),
    badges: options?.badges || [],
    isSupporter: options?.isSupporter || false,
    isOutgoing: options?.isOutgoing || false,
    isDeleted: options?.isDeleted || false,
    canRenderInOverlay: options?.canRenderInOverlay ?? true,
    replyToMessageId: options?.replyToMessageId,
    actions: {
      reply: customActions?.reply || options?.actions?.reply || { kind: 'reply' as MessageActionKind, status: 'available' as MessageActionStatus },
      delete: customActions?.delete || options?.actions?.delete || { kind: 'delete' as MessageActionKind, status: 'available' as MessageActionStatus },
    },
    rawPayload: {
      providerEvent: rawPayloadOverride.providerEvent || defaultProviderEvent,
      providerChannelId: channelId,
      providerUserId: options?.sourceUserId || '',
      preview: rawPayloadOverride.preview || options?.text || '',
    },
  };
}

export function getPlatformLabel(platform: string): string {
  return platform;
}

export function getDensityCardClasses(density: DensityMode): string {
  return density === 'compact'
    ? 'gap-3 rounded-[1.25rem] p-3'
    : 'gap-4 rounded-[1.5rem] p-4';
}

export function getDensityTextClasses(density: DensityMode): string {
  return density === 'compact'
    ? 'text-xs leading-5'
    : 'text-sm leading-6';
}

export function buildOverlayUrl(port: number, widgetId: string): string {
  return `http://127.0.0.1:${port}/overlay?widgetId=${encodeURIComponent(widgetId)}`;
}

export function createMessageActionState(
  kind: MessageActionKind,
  status: MessageActionStatus,
  reason?: string
): { kind: MessageActionKind; status: MessageActionStatus; reason?: string } {
  return { kind, status, reason };
}

export function groupByPlatform<T extends { platform: PlatformType }>(items: T[]): Record<PlatformType, T[]> {
  const result: Record<string, T[]> = {};
  const platforms: PlatformType[] = ['twitch', 'kick', 'youtube', 'trovo'];
  for (const p of platforms) {
    result[p] = [];
  }
  for (const item of items) {
    const key = item.platform;
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result as Record<PlatformType, T[]>;
}
