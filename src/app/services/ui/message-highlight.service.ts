import { Injectable, signal } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class MessageHighlightService {
  private readonly highlightedMessageIdSignal = signal<string | null>(null);
  readonly highlightedMessageId = this.highlightedMessageIdSignal.asReadonly();

  highlightMessage(messageId: string | null): void {
    this.highlightedMessageIdSignal.set(messageId);
  }

  isMessageHighlighted(messageId: string): boolean {
    return this.highlightedMessageIdSignal() === messageId;
  }
}
