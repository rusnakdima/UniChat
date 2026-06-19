import { Injectable } from '@angular/core';

export interface OverlayChatMessage {
  id: string;
  text: string;
  sender: string;
  platform: string;
  author: string;
  authorAvatarUrl: string;
  channelImageUrl: string;
  sourceChannelId: string;
  timestamp: number;
  emotes?: Map<string, { id: string; code: string }>;
  isSupporter?: boolean;
}

@Injectable({ providedIn: 'root' })
export class OverlayWsStateService {
  readonly isConnected = false;
  private _messages = signal<OverlayChatMessage[]>([]);
  readonly messages = this._messages.asReadonly();

  connect(): void {}
  disconnect(): void {}
  sendMessage(data: unknown): void {}
  addMessage(message: OverlayChatMessage): void { this._messages.update(msgs => [...msgs, message]); }
}
