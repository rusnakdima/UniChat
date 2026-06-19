import { Injectable } from '@angular/core';

export type MessageType = 'chat' | 'action' | 'system' | 'whisper';

@Injectable({ providedIn: 'root' })
export class MessageTypeDetectorService {
  private _lastMessageTime = 0;

  detect(message: unknown): { type: MessageType; reason?: string } { return { type: 'chat' }; }
  detectMessageType(message: unknown): { type: MessageType; reason?: string } { return this.detect(message); }
  updateLastMessageTime(message: unknown): void { this._lastMessageTime = Date.now(); }
}
