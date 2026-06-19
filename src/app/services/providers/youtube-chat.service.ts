import { Injectable } from '@angular/core';

export interface YouTubeChatMessage {
  id: string;
  text: string;
  author: string;
}

@Injectable({ providedIn: 'root' })
export class YouTubeChatService {
  connect(channelId: string): void {}
  disconnect(): void {}
  sendMessage(text: string): void {}
}
