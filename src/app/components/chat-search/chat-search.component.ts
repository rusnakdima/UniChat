/* sys lib */
import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { ChatMessage } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ChatSearchService, SearchResult } from "@services/ui/chat-search.service";

/* components */
import { CheckboxComponent } from "@components/ui/checkbox/checkbox.component";
@Component({
  selector: "app-chat-search",
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatProgressSpinnerModule,
    DatePipe,
    CheckboxComponent,
  ],
  templateUrl: "./chat-search.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatSearchComponent {
  private readonly chatSearchService = inject(ChatSearchService);
  private readonly chatListService = inject(ChatListService);

  readonly searchQuery = signal("");
  readonly isRegex = signal(false);
  readonly caseSensitive = signal(false);
  readonly searchPlatform = signal<string>("all");
  readonly searchChannel = signal<string>("all");
  readonly searchAuthor = signal("");

  readonly isSearching = this.chatSearchService.isSearching;
  readonly searchResults = this.chatSearchService.searchResults;
  readonly hasResults = this.chatSearchService.hasResults;
  readonly resultCount = this.chatSearchService.resultCount;

  readonly platforms = computed(() => {
    const channels = this.chatListService.getVisibleChannels();
    return Array.from(new Set(channels.map((ch) => ch.platform)));
  });

  readonly channels = computed(() => {
    const platform = this.searchPlatform();
    const channels = this.chatListService.getVisibleChannels();
    if (platform !== "all") {
      return channels.filter((ch) => ch.platform === platform);
    }
    return channels;
  });

  readonly messageSelected = output<ChatMessage>();
  readonly closeSearch = output<void>();

  onSearch(): void {
    const query = this.searchQuery().trim();
    if (!query) {
      this.chatSearchService.clearSearch();
      return;
    }

    this.chatSearchService.search({
      query,
      isRegex: this.isRegex(),
      caseSensitive: this.caseSensitive(),
      platform: this.searchPlatform() !== "all" ? (this.searchPlatform() as any) : undefined,
      channelId: this.searchChannel() !== "all" ? this.searchChannel() : undefined,
      author: this.searchAuthor().trim() || undefined,
      limit: 50,
    });
  }

  onClear(): void {
    this.searchQuery.set("");
    this.searchAuthor.set("");
    this.searchPlatform.set("all");
    this.searchChannel.set("all");
    this.chatSearchService.clearSearch();
  }

  onSelectResult(result: SearchResult): void {
    this.messageSelected.emit(result.message);
  }

  getMatchTypeLabel(matchType: SearchResult["matchType"]): string {
    switch (matchType) {
      case "both":
        return "Text & Author";
      case "author":
        return "Author only";
      default:
        return "Text";
    }
  }
}
