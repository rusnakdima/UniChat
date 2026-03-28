/* sys lib */
import { Injectable, inject, signal } from "@angular/core";

/* models */
import { ChatMessage } from "@models/chat.model";

/* services */
import { ChatStateService } from "@services/data/chat-state.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { SplitFeedUiService } from "@services/ui/split-feed-ui.service";
@Injectable({
  providedIn: "root",
})
export class DashboardChatInteractionService {
  private readonly chatStateService = inject(ChatStateService);
  private readonly dashboardPreferences = inject(DashboardPreferencesService);
  private readonly splitFeedUi = inject(SplitFeedUiService);

  readonly replyTargetMessageId = signal<string | null>(null);
  readonly highlightMessageId = signal<string | null>(null);

  onReplyClick(messageId: string): void {
    const msg = this.chatStateService.messages().find((m) => m.id === messageId);
    if (!msg || msg.actions.reply.status !== "available") {
      return;
    }
    if (this.dashboardPreferences.preferences().feedMode === "mixed") {
      this.replyTargetMessageId.set(messageId);
      this.highlightMessageId.set(messageId);
      this.dashboardPreferences.setFeedMode("split");
      this.splitFeedUi.setActiveChannel(msg.platform, msg.sourceChannelId);
      return;
    }
    this.toggleReplyTarget(messageId);
  }

  toggleReplyTarget(messageId: string): void {
    this.replyTargetMessageId.update((current) => {
      const next = current === messageId ? null : messageId;
      this.highlightMessageId.set(next);
      return next;
    });
  }

  cancelReplyContext(): void {
    this.replyTargetMessageId.set(null);
    this.highlightMessageId.set(null);
  }

  deleteMessage(messageId: string): void {
    this.chatStateService.deleteMessage(messageId);
  }

  submitReplyFromComposer(draft: string): void {
    const id = this.replyTargetMessageId();
    if (!id || !draft.trim()) {
      return;
    }
    void this.chatStateService.submitReply(id, draft.trim());
    this.cancelReplyContext();
  }

  replyTargetMessage(): ChatMessage | undefined {
    const id = this.replyTargetMessageId();
    if (!id) {
      return undefined;
    }
    return this.chatStateService.messages().find((m) => m.id === id);
  }

  isHighlightedMessage(messageId: string): boolean {
    return this.highlightMessageId() === messageId;
  }

  replyParentSnippet(message: ChatMessage): string | null {
    if (!message.replyToMessageId) {
      return null;
    }
    const parent = this.chatStateService.messages().find((m) => m.id === message.replyToMessageId);
    if (!parent) {
      return null;
    }
    const excerpt = parent.text.length > 80 ? `${parent.text.slice(0, 80)}…` : parent.text;
    return `${parent.author}: ${excerpt}`;
  }
}
