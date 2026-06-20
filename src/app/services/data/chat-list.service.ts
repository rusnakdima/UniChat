import { Injectable, signal, effect } from "@angular/core";
import { ChatChannel } from "@entities/chat.model";
export type { ChatChannel } from "@entities/chat.model";

const CHANNELS_STORAGE_KEY = "unichat_channels";

@Injectable({ providedIn: "root" })
export class ChatListService {
  private _channels = signal<ChatChannel[]>(this.loadFromStorage());
  readonly channels = this._channels.asReadonly();

  constructor() {
    effect(() => {
      const channels = this._channels();
      this.saveToStorage(channels);
    });
  }

  private loadFromStorage(): ChatChannel[] {
    try {
      const stored = localStorage.getItem(CHANNELS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(channels: ChatChannel[]): void {
    try {
      localStorage.setItem(CHANNELS_STORAGE_KEY, JSON.stringify(channels));
    } catch (e) {
      console.error("[CHAT_LIST] Failed to save channels to localStorage:", e);
    }
  }

  getChats(): ChatChannel[] {
    return this._channels();
  }
  getVisibleChannels(): ChatChannel[] {
    return this._channels().filter((ch) => ch.isVisible);
  }
  getChannels(): ChatChannel[] {
    return this._channels();
  }
  getChannelDisplayName(channelRef: string): string {
    return channelRef;
  }

  addChannel(channel: Omit<ChatChannel, "id">): void {
    const newChannel: ChatChannel = { ...channel, id: crypto.randomUUID() };
    this._channels.update((channels) => [...channels, newChannel]);
  }

  removeChannel(channelId: string): void {
    this._channels.update((channels) => channels.filter((ch) => ch.id !== channelId));
  }

  toggleChannelVisibility(channelId: string): void {
    this._channels.update((channels) =>
      channels.map((ch) => (ch.channelId === channelId ? { ...ch, isVisible: !ch.isVisible } : ch))
    );
  }

  updateChannelAccount(channelId: string, accountId: string): void {
    this._channels.update((channels) =>
      channels.map((ch) => (ch.channelId === channelId ? { ...ch, accountId } : ch))
    );
  }

  updateChannelName(channelId: string, name: string): void {
    this._channels.update((channels) =>
      channels.map((ch) => (ch.channelId === channelId ? { ...ch, channelName: name } : ch))
    );
  }

  addChat(channelRef: string): void {}
  removeChat(channelRef: string): void {}
}
