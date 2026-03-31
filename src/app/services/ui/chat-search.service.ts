/* sys lib */
import { Injectable, inject, computed, signal } from "@angular/core";

/* models */
import { ChatMessage, PlatformType } from "@models/chat.model";

/* services */
import { ChatStorageService } from "@services/data/chat-storage.service";
export interface SearchOptions {
  query: string;
  platform?: PlatformType;
  channelId?: string;
  author?: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  limit?: number;
}

export interface SearchResult {
  message: ChatMessage;
  matchType: "text" | "author" | "both";
  highlightedSegments: HighlightSegment[];
}

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/**
 * Chat Search Service - Full-text search across session buffer
 *
 * Responsibility: Provides search functionality across all messages in the current session.
 * Supports text search, author search, platform/channel filtering, and regex patterns.
 */
@Injectable({
  providedIn: "root",
})
export class ChatSearchService {
  private readonly chatStorageService = inject(ChatStorageService);

  private readonly searchQuerySignal = signal("");
  private readonly searchResultsSignal = signal<SearchResult[]>([]);
  private readonly isSearchingSignal = signal(false);

  readonly searchQuery = this.searchQuerySignal.asReadonly();
  readonly searchResults = this.searchResultsSignal.asReadonly();
  readonly isSearching = this.isSearchingSignal.asReadonly();
  readonly hasResults = computed(() => this.searchResultsSignal().length > 0);
  readonly resultCount = computed(() => this.searchResultsSignal().length);

  /**
   * Search messages with the given options
   */
  search(options: SearchOptions): SearchResult[] {
    this.isSearchingSignal.set(true);
    this.searchQuerySignal.set(options.query);

    if (!options.query.trim()) {
      this.searchResultsSignal.set([]);
      this.isSearchingSignal.set(false);
      return [];
    }

    const limit = options.limit ?? 100;
    const results: SearchResult[] = [];
    const allMessages = this.chatStorageService.allMessages();

    // Build search pattern
    let pattern: RegExp | null = null;
    try {
      if (options.isRegex) {
        const flags = options.caseSensitive ? "" : "i";
        pattern = new RegExp(options.query, flags);
      } else {
        // Escape regex special characters for literal search
        const escaped = options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const flags = options.caseSensitive ? "" : "i";
        pattern = new RegExp(escaped, flags);
      }
    } catch {
      this.isSearchingSignal.set(false);
      return [];
    }

    // Filter and search messages
    for (const message of allMessages) {
      if (results.length >= limit) {
        break;
      }

      // Apply platform filter
      if (options.platform && message.platform !== options.platform) {
        continue;
      }

      // Apply channel filter
      if (options.channelId && message.sourceChannelId !== options.channelId) {
        continue;
      }

      // Search in text and author
      const textMatch = pattern.test(message.text);
      const authorMatch = pattern.test(message.author);

      if (textMatch || authorMatch) {
        // Apply author filter if specified
        if (options.author) {
          const authorPattern = options.caseSensitive
            ? new RegExp(options.author)
            : new RegExp(options.author, "i");
          if (!authorPattern.test(message.author)) {
            continue;
          }
        }

        results.push({
          message,
          matchType: textMatch && authorMatch ? "both" : textMatch ? "text" : "author",
          highlightedSegments: this.highlightMatches(message.text, pattern),
        });
      }
    }

    this.searchResultsSignal.set(results);
    this.isSearchingSignal.set(false);
    return results;
  }

  /**
   * Clear current search results
   */
  clearSearch(): void {
    this.searchQuerySignal.set("");
    this.searchResultsSignal.set([]);
    this.isSearchingSignal.set(false);
  }

  /**
   * Search by author name
   */
  searchByAuthor(author: string, limit?: number): SearchResult[] {
    return this.search({
      query: author,
      author,
      limit,
    });
  }

  /**
   * Search in specific channel
   */
  searchInChannel(channelId: string, query: string, limit?: number): SearchResult[] {
    return this.search({
      query,
      channelId,
      limit,
    });
  }

  /**
   * Search by platform
   */
  searchByPlatform(platform: PlatformType, query: string, limit?: number): SearchResult[] {
    return this.search({
      query,
      platform,
      limit,
    });
  }

  /**
   * Get unique authors from search results or all messages
   */
  getUniqueAuthors(limit?: number): string[] {
    const authors = new Set<string>();
    const messages = this.hasResults()
      ? this.searchResultsSignal().map((r) => r.message)
      : this.chatStorageService.allMessages();

    for (const message of messages) {
      if (limit && authors.size >= limit) {
        break;
      }
      authors.add(message.author);
    }

    return Array.from(authors);
  }

  private highlightMatches(text: string, pattern: RegExp): HighlightSegment[] {
    // Build a safe highlighting token stream without using HTML strings.
    // Use global regex for iteration; pattern itself intentionally does NOT include `g`.
    const highlightFlags = pattern.flags.includes("i") ? "gi" : "g";
    const re = new RegExp(pattern.source, highlightFlags);

    const segments: HighlightSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const matchText = match[0];
      const end = start + matchText.length;

      // Prevent infinite loops for patterns that can match empty strings.
      if (matchText.length === 0) {
        re.lastIndex = start + 1;
        continue;
      }

      if (start > lastIndex) {
        segments.push({ text: text.slice(lastIndex, start), isMatch: false });
      }
      segments.push({ text: matchText, isMatch: true });
      lastIndex = end;
    }

    if (segments.length === 0) {
      return [{ text, isMatch: false }];
    }

    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), isMatch: false });
    }

    return segments;
  }
}
