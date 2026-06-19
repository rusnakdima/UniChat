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

export interface DashboardChatInteractionState {
  replyTargetMessageId: string | null;
  replyParentSnippet: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardChatInteractionService {
  private _replyTarget = signal<string | null>(null);
  private _replySnippet = signal<string>('');
  private _highlightedMessage = signal<string | null>(null);

  readonly replyTargetMessageId = computed(() => this._replyTarget());
  readonly replyParentSnippet = computed(() => this._replySnippet());
  readonly isHighlightedMessage = computed(() => (messageId: string) => this._highlightedMessage() === messageId);

  onMessageClicked(messageId: string): void {}
  onReplyToMessage(messageId: string): void { this._replyTarget.set(messageId); }
  onReplyClick(messageId: string, snippet: string): void { this._replyTarget.set(messageId); this._replySnippet.set(snippet); }
  cancelReplyContext(): void { this._replyTarget.set(null); this._replySnippet.set(''); }
  deleteMessage(messageId: string): void {}
  submitReplyFromComposer(text: string): void { this._replyTarget.set(null); this._replySnippet.set(''); }
}

function computed<T>(fn: () => T): import('@angular/core').Signal<T> {
  return signal(fn()) as import('@angular/core').Signal<T>;
}
