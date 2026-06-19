import { Injectable } from "@angular/core";

export interface ChatState {
  isConnected: boolean;
  currentChannel: string | null;
  highlightedMessageId: string | null;
}

@Injectable({ providedIn: "root" })
export class ChatStateService {
  private _state = signal<ChatState>({
    isConnected: false,
    currentChannel: null,
    highlightedMessageId: null,
  });
  readonly state = this._state.asReadonly();

  getState(): ChatState {
    return this._state();
  }
  setChannel(channelRef: string): void {
    this._state.update((s) => ({ ...s, currentChannel: channelRef }));
  }
  setHighlightedMessage(messageId: string | null): void {
    this._state.update((s) => ({ ...s, highlightedMessageId: messageId }));
  }
  sendOutgoingChatMessage(message: string): void {}
}
