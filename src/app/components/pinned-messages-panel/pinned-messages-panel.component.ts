import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { PinnedMessagesService, PinnedMessage } from "@services/ui/pinned-messages.service";
import { ChatListService } from "@services/data/chat-list.service";
import { DatePipe } from "@angular/common";

@Component({
  selector: "app-pinned-messages-panel",
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    DatePipe,
  ],
  templateUrl: "./pinned-messages-panel.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PinnedMessagesPanelComponent {
  private readonly pinnedMessagesService = inject(PinnedMessagesService);
  private readonly chatListService = inject(ChatListService);

  readonly pinnedMessages = this.pinnedMessagesService.pinnedMessages;
  readonly pinnedCount = this.pinnedMessagesService.pinnedCount;
  readonly hasPinnedMessages = this.pinnedMessagesService.hasPinnedMessages;

  readonly filterPlatform = signal<string>("all");
  readonly filterChannel = signal<string>("all");
  readonly editNoteId = signal<string | null>(null);
  readonly editNoteText = signal("");

  readonly platforms = computed(() => {
    const channels = this.chatListService.getVisibleChannels();
    return Array.from(new Set(channels.map((ch) => ch.platform)));
  });

  readonly channels = computed(() => {
    const platform = this.filterPlatform();
    const channels = this.chatListService.getVisibleChannels();
    if (platform !== "all") {
      return channels.filter((ch) => ch.platform === platform);
    }
    return channels;
  });

  readonly filteredPinnedMessages = computed(() => {
    let messages = this.pinnedMessages();
    
    if (this.filterPlatform() !== "all") {
      messages = messages.filter(m => m.platform === this.filterPlatform());
    }
    
    if (this.filterChannel() !== "all") {
      messages = messages.filter(m => m.channelId === this.filterChannel());
    }
    
    // Sort by pinned date (newest first)
    return messages.sort((a, b) => 
      new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime()
    );
  });

  readonly closed = output<void>();

  startEditNote(pin: PinnedMessage): void {
    this.editNoteId.set(pin.id);
    this.editNoteText.set(pin.note ?? "");
  }

  saveNote(pinId: string): void {
    this.pinnedMessagesService.updateNote(pinId, this.editNoteText());
    this.editNoteId.set(null);
  }

  cancelEdit(): void {
    this.editNoteId.set(null);
  }

  unpin(pinId: string): void {
    this.pinnedMessagesService.unpinMessage(pinId);
  }

  clearAll(): void {
    if (confirm("Are you sure you want to unpin all messages?")) {
      this.pinnedMessagesService.clearAll();
    }
  }

  exportPinned(): void {
    const json = this.pinnedMessagesService.exportPinned();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unichat-pinned-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
