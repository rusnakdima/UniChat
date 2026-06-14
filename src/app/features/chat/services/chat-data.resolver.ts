/* sys lib */
import { inject } from "@angular/core";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ChatStateManagerService } from "@services/data/chat-state-manager.service";
import { ChatProviderCoordinatorService } from "@services/providers/chat-provider-coordinator.service";
import { buildChannelRef } from "@utils/channel-ref.util";
/**
 * Resolver for dashboard route that prevents unnecessary refetching.
 * Follows TaskFlow's storage-first pattern:
 * - Returns immediately if chat is already initialized
 * - Only connects channels if not already connected
 * - Prevents refetching when navigating back from settings
 */
export const ChatDataResolver = () => {
  const chatStateManager = inject(ChatStateManagerService);
  const chatListService = inject(ChatListService);
  const providerCoordinator = inject(ChatProviderCoordinatorService);

  // If already initialized, return immediately (data is cached in signals)
  if (chatStateManager.isInitialized()) {
    return { initialized: true, fromCache: true };
  }

  // Mark as initialized to prevent future re-fetches
  chatStateManager.markAsInitialized();

  // Connect all visible channels (they will check connection state internally)
  const channels = chatListService.getVisibleChannels();

  for (const channel of channels) {
    const channelRef = buildChannelRef(channel.platform, channel.channelId);
    if (!chatStateManager.isChannelConnected(channelRef)) {
      providerCoordinator.connectChannel(channel.channelId, channel.platform);
      chatStateManager.markChannelAsConnected(channelRef);
    }
  }

  return { initialized: true, fromCache: false, channelCount: channels.length };
};
