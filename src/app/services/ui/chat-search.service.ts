import { Injectable, signal, computed, Signal } from "@angular/core";
import { ChatMessage } from "@entities/chat.model";

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

export interface SearchResult {
  messageId: string;
  channelRef: string;
  text: string;
  timestamp: number;
  matchType?: "text" | "author" | "both";
  message: ChatMessage;
  highlightedSegments: HighlightSegment[];
}

export interface SearchOptions {
  query: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  platform?: string;
  channelId?: string;
  author?: string;
  limit?: number;
}

@Injectable({ providedIn: "root" })
export class ChatSearchService {
  private _results = signal<SearchResult[]>([]);
  private _isSearching = signal(false);

  searchResults = this._results.asReadonly();
  isSearching = this._isSearching.asReadonly();
  hasResults = computed(() => this._results().length > 0);
  resultCount = computed(() => this._results().length);

  async search(options: SearchOptions): Promise<SearchResult[]> {
    this._isSearching.set(true);
    try {
      const results = await this.doSearch(options);
      this._results.set(results);
      return results;
    } finally {
      this._isSearching.set(false);
    }
  }

  private async doSearch(options: SearchOptions): Promise<SearchResult[]> {
    return [];
  }

  clearSearch(): void {
    this._results.set([]);
  }
}
