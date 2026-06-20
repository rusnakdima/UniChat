import { Injectable, signal, effect, inject } from "@angular/core";
import { ChatChannel } from "@entities/chat.model";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { buildChannelRef } from "@utils/channel-ref.util";
export type { ChatChannel } from "@entities/chat.model";

const CHANNELS_STORAGE_KEY = "unichat_channels";

@Injectable({ providedIn: "root" })
export class ChatListService {
  private _channels = signal<ChatChannel[]>([]);
  readonly channels = this._channels.asReadonly();
  private readonly prefs = inject(DashboardPreferencesService, { optional: true });

  constructor() {
    effect(() => {
      const channels = this._channels();
      this.saveToStorage(channels);
    });
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(CHANNELS_STORAGE_KEY);
      const channels: ChatChannel[] = stored ? JSON.parse(stored) : [];
      this._channels.set(channels);
      if (this.prefs) {
        const validRefs = new Set(channels.map((ch) => buildChannelRef(ch.platform, ch.channelId)));
        this.prefs.cleanMixedEnabledChannelIds(validRefs);
        for (const ch of channels) {
          if (ch.isVisible) {
            const ref = buildChannelRef(ch.platform, ch.channelId);
            this.prefs.addMixedEnabledChannelId(ref);
          }
        }
      }
    } catch {
      this._channels.set([]);
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
    if (newChannel.isVisible && this.prefs) {
      const ref = buildChannelRef(newChannel.platform, newChannel.channelId);
      this.prefs.addMixedEnabledChannelId(ref);
    }
  }

  removeChannel(channelId: string): void {
    this._channels.update((channels) => {
      const channel = channels.find((ch) => ch.id === channelId);
      if (channel && this.prefs) {
        const ref = buildChannelRef(channel.platform, channel.channelId);
        this.prefs.removeMixedEnabledChannelId(ref);
      }
      return channels.filter((ch) => ch.id !== channelId);
    });
  }

  toggleChannelVisibility(channelId: string): void {
    this._channels.update((channels) =>
      channels.map((ch) => {
        if (ch.channelId !== channelId) return ch;
        const updated = { ...ch, isVisible: !ch.isVisible };
        if (updated.isVisible && this.prefs) {
          const ref = buildChannelRef(updated.platform, updated.channelId);
          this.prefs.addMixedEnabledChannelId(ref);
        }
        return updated;
      })
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
