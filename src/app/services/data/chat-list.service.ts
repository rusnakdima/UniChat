import { DashboardPreferencesService } from '@services/ui/dashboard-preferences.service';
import { ChatChannel } from '@entities/chat.model';

export class ChatListService {
  channels: ChatChannel[] = [];

  constructor(private prefs: DashboardPreferencesService) {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('unichat_channels');
      if (stored) {
        this.channels = JSON.parse(stored);
        const validRefs = new Set(this.channels.map(c => `${c.platform}:${c.channelId}`));
        this.prefs.cleanMixedEnabledChannelIds(validRefs);
        for (const channel of this.channels) {
          if (channel.isVisible) {
            this.prefs.addMixedEnabledChannelId(`${channel.platform}:${channel.channelId}`);
          }
        }
      }
    } catch {
      this.channels = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('unichat_channels', JSON.stringify(this.channels));
    } catch {
      // Storage write error - ignore
    }
  }

  getChats(): ChatChannel[] {
    return this.channels;
  }

  getChannels(): ChatChannel[] {
    return this.getChats();
  }

  getVisibleChannels(): ChatChannel[] {
    return this.channels.filter(c => c.isVisible);
  }

  getChannelDisplayName(ref: string): string {
    return ref;
  }

  addChannel(channel: Omit<ChatChannel, 'id'>): void {
    const id = crypto.randomUUID();
    const newChannel = { ...channel, id } as ChatChannel;
    this.channels.push(newChannel);
    if (newChannel.isVisible) {
      this.prefs.addMixedEnabledChannelId(`${newChannel.platform}:${newChannel.channelId}`);
    }
    this.saveToStorage();
  }

  removeChannel(id: string): void {
    const idx = this.channels.findIndex(c => c.id === id);
    if (idx !== -1) {
      const channel = this.channels[idx];
      this.channels.splice(idx, 1);
      this.prefs.removeMixedEnabledChannelId(`${channel.platform}:${channel.channelId}`);
      this.saveToStorage();
    }
  }

  toggleChannelVisibility(channelId: string): void {
    const channel = this.channels.find(c => c.channelId === channelId);
    if (channel) {
      channel.isVisible = !channel.isVisible;
      if (channel.isVisible) {
        this.prefs.addMixedEnabledChannelId(`${channel.platform}:${channel.channelId}`);
      }
      this.saveToStorage();
    }
  }

  updateChannelAccount(channelId: string, accountId: string): void {
    const channel = this.channels.find(c => c.channelId === channelId);
    if (channel) {
      channel.accountId = accountId;
      this.saveToStorage();
    }
  }

  updateChannelName(channelId: string, channelName: string): void {
    const channel = this.channels.find(c => c.channelId === channelId);
    if (channel) {
      channel.channelName = channelName;
      this.saveToStorage();
    }
  }

  addChat(channelRef: string): void {}
  removeChat(channelRef: string): void {}
}
