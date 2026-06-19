import { Injectable } from '@angular/core';

export interface TwitchChatMessage {
  id: string;
  text: string;
  user: string;
  color: string;
}

@Injectable({ providedIn: 'root' })
export class TwitchChatService {
  connect(channel: string): void {}
  disconnect(): void {}
  sendMessage(text: string): void {}
  fetchUserProfileImage(userId: string): Promise<string> { return Promise.resolve(''); }
  loadChannelHistory(channelId: string, limit: number): Promise<TwitchChatMessage[]> { return Promise.resolve([]); }
}
