import { Injectable, inject } from "@angular/core";

import { ChatMessage } from "@models/chat.model";
import { ChatPruningService } from "@services/data/chat-pruning.service";
import { UnifiedStorageService } from "@services/storage/unified-storage.service";

@Injectable({
  providedIn: "root",
})
export class ChatMemoryService {
  private readonly unified = inject(UnifiedStorageService);
  private readonly pruning = inject(ChatPruningService);

  enforceGlobalCap(): void {
    this.unified.enforceGlobalCap();
  }

  pruneOldMessages(): void {
    this.unified.pruneOldMessages();
  }

  getMemoryStats(): { totalMessages: number; channels: number; byChannel: Record<string, number> } {
    return this.unified.getMemoryStats();
  }
}
