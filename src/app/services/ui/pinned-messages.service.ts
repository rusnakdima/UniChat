import { Injectable } from "@angular/core";

export interface PinnedMessage {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  channelId?: string;
  note?: string;
  platform?: string;
  pinnedAt?: number;
}

@Injectable({ providedIn: "root" })
export class PinnedMessagesService {
  private _pinnedMessages = new Map<string, PinnedMessage[]>();

  get pinnedCount(): number {
    return this.getPinnedMessages().length;
  }

  getPinnedMessages(): PinnedMessage[] {
    const all: PinnedMessage[] = [];
    this._pinnedMessages.forEach((msgs) => all.push(...msgs));
    return all;
  }

  getPinnedMessagesByChannel(channelId: string): PinnedMessage[] {
    return this._pinnedMessages.get(channelId) || [];
  }

  pinMessage(messageId: string, channelId?: string): void {
    const msgs = channelId ? this._pinnedMessages.get(channelId) || [] : [];
    const pinned: PinnedMessage = {
      id: messageId,
      text: "",
      sender: "",
      timestamp: Date.now(),
      channelId,
      pinnedAt: Date.now(),
    };
    if (channelId) this._pinnedMessages.set(channelId, [...msgs, pinned]);
  }

  unpinMessage(messageId: string): void {
    this._pinnedMessages.forEach((msgs, channelId) => {
      this._pinnedMessages.set(
        channelId,
        msgs.filter((m) => m.id !== messageId)
      );
    });
  }

  unpinByMessageId(messageId: string): void {
    this.unpinMessage(messageId);
  }

  clearAll(): void {
    this._pinnedMessages.clear();
  }
  exportPinned(channelId: string): Promise<PinnedMessage[]> {
    return Promise.resolve([]);
  }
  isPinned(messageId: string): boolean {
    return this.getPinnedMessages().some((m) => m.id === messageId);
  }
  updateNote(messageId: string, note: string): void {
    this._pinnedMessages.forEach((msgs, channelId) => {
      this._pinnedMessages.set(
        channelId,
        msgs.map((m) => (m.id === messageId ? { ...m, note } : m))
      );
    });
  }
}
