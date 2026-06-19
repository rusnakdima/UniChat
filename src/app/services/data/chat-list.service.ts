import { Injectable, signal } from '@angular/core';

export interface ChatChannel {
  id: string;
  platform: string;
  channelId: string;
  channelName: string;
  isVisible: boolean;
  isConnected: boolean;
  unreadCount: number;
  accountId?: string;
  channelImageUrl?: string;
  isAuthorized?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatListService {
  private _channels = signal<ChatChannel[]>([]);
  readonly channels = this._channels.asReadonly();

  getChats(): ChatChannel[] { return this._channels(); }
  getVisibleChannels(): ChatChannel[] { return this._channels().filter(ch => ch.isVisible); }
  getChannels(): ChatChannel[] { return this._channels(); }
  getChannelDisplayName(channelRef: string): string { return channelRef; }

  addChannel(channel: Omit<ChatChannel, 'id'>): void {
    const newChannel: ChatChannel = { ...channel, id: crypto.randomUUID() };
    this._channels.update(channels => [...channels, newChannel]);
  }

  removeChannel(channelId: string): void {
    this._channels.update(channels => channels.filter(ch => ch.channelId !== channelId));
  }

  toggleChannelVisibility(channelId: string): void {
    this._channels.update(channels =>
      channels.map(ch => ch.channelId === channelId ? { ...ch, isVisible: !ch.isVisible } : ch)
    );
  }

  updateChannelAccount(channelId: string, accountId: string): void {
    this._channels.update(channels =>
      channels.map(ch => ch.channelId === channelId ? { ...ch, accountId } : ch)
    );
  }

  updateChannelName(channelId: string, name: string): void {
    this._channels.update(channels =>
      channels.map(ch => ch.channelId === channelId ? { ...ch, channelName: name } : ch)
    );
  }

  addChat(channelRef: string): void {}
  removeChat(channelRef: string): void {}
}
