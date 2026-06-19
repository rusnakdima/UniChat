// Type augmentations for stub services to satisfy consuming code
import { OverlayWsStateService } from "@services/ui/overlay-ws-state.service";
import { ChatRichTextService } from "@services/ui/chat-rich-text.service";
import { CustomEmoteManagerService } from "@services/features/custom-emote-manager.service";
import { ChatBatchingService } from "@services/data/chat-batching.service";
import { SessionExportService } from "@services/ui/session-export.service";
import { OverlayStorageService } from "@app/shared/services/overlay-storage.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChatSearchService } from "@services/ui/chat-search.service";
import { MessageTypeDetectorService } from "@services/ui/message-type-detector.service";
import { PlatformResolverService } from "@services/core/platform-resolver.service";

// Augment services with additional properties/methods as needed
declare module "@services/ui/overlay-ws-state.service" {
  interface OverlayWsStateService {
    messages: any[];
    addMessage(message: any): void;
  }
}

declare module "@services/ui/chat-rich-text.service" {
  interface ChatRichTextService {
    buildSegments(text: string): any[];
  }
}

declare module "@services/features/custom-emote-manager.service" {
  interface CustomEmoteManagerService {
    emotes: any[];
    getEmotesForMessageRendering(): Map<string, any>;
    getRecentEmotes(): any[];
    searchEmotes(query: string): any[];
  }
}

declare module "@services/data/chat-batching.service" {
  interface ChatBatchingService {
    scheduleBatchFlush(): void;
  }
}

declare module "@services/ui/session-export.service" {
  interface SessionExportService {
    getExportPreview(options: any): Promise<{ count: number }>;
  }
}

declare module "@app/shared/services/overlay-storage.service" {
  interface OverlayStorageService {
    readOverlayChannelIds(overlayId: string, fallback?: string[]): string[];
    readOverlayAnimationType(overlayId: string): string;
    readOverlayAnimationDirection(overlayId: string): string;
    readOverlayCustomCss(overlayId: string): string;
    readOverlayTransparentBg(overlayId: string): boolean;
    readOverlayTextSize(overlayId: string): number;
    readOverlayMaxMessages(overlayId: string): number;
  }
}

declare module "@services/ui/chat-message-presentation.service" {
  interface ChatMessagePresentationService {
    platformLabel(message: any): string;
    platformIconUrl(message: any): string;
    usernameColorClasses(message: any): string[];
    messageBadgeClasses(message: any): string[];
    messageTimeLabel(message: any): string;
    messageFullTimeLabel(message: any): string;
    replyParentSnippet(message: any): string;
    getHighlightColor(message: any): string;
  }
}

declare module "@services/ui/chat-search.service" {
  interface ChatSearchService {
    hasResults: boolean;
    isSearching: boolean;
    resultCount: number;
    searchResults: any[];
  }
}

declare module "@services/ui/message-type-detector.service" {
  interface MessageTypeDetectorService {
    updateLastMessageTime(message: any): void;
  }
}

declare module "@services/core/platform-resolver.service" {
  interface PlatformResolverService {
    getBadgeClasses(platform: string): string;
    getChannelDisplayName(platform: string, channelId: string): string;
    getDisplayName(platform: string, channelId: string): string;
    getMixedFilterBadgeClasses(platform: string): string;
  }
}
