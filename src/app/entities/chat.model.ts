export type PlatformType = 'twitch' | 'kick' | 'youtube' | 'trovo';

export interface PlatformAccount {
  id: string;
  platform: string;
  username: string;
  userId: string;
  avatarUrl: string;
  isConnected: boolean;
  authStatus: string;
  accessToken: string;
  authorizedAt: string;
}

export interface ChatChannel {
  id: string;
  platform: PlatformType;
  channelId: string;
  channelName: string;
  channelImageUrl?: string;
  isAuthorized: boolean;
  accountId: string;
  accountCapabilities?: string[];
  isVisible: boolean;
  addedAt: string;
}

export interface ChatMessage {
  id: string;
  platform: PlatformType;
  sourceMessageId: string;
  sourceChannelId: string;
  sourceUserId: string;
  author: string;
  text: string;
  timestamp: string;
  badges: string[];
  isSupporter: boolean;
  isOutgoing: boolean;
  isDeleted: boolean;
  canRenderInOverlay: boolean;
  replyToMessageId?: string;
  actions: {
    reply: MessageAction;
    delete: MessageAction;
  };
  rawPayload: {
    providerEvent: string;
    providerChannelId: string;
    providerUserId: string;
    preview: string;
  };
}

export interface MessageAction {
  kind: MessageActionKind;
  status: MessageActionStatus;
  reason?: string;
}

export type MessageActionKind = 'reply' | 'delete';
export type MessageActionStatus = 'available' | 'pending' | 'disabled' | 'failed';

export type DensityMode = 'compact' | 'comfortable';
