/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/* models */
import { ChatBadgeIcon } from "@models/chat.model";
import { KickUserInfo, TwitchUserInfo } from "@models/platform-api.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { KickChatService } from "@services/providers/kick-chat.service";
import { TwitchViewerCardService } from "@services/providers/twitch-viewer-card.service";
import { YouTubeChatService } from "@services/providers/youtube-chat.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { UserProfilePopoverService } from "@services/ui/user-profile-popover.service";
const PANEL_WIDTH = 352;
const PANEL_HEIGHT = 450;
const GAP = 8;
const VIEW_PAD = 8;

export interface UserProfilePanelLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

@Component({
  selector: "app-user-profile-popover",
  standalone: true,
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: "./user-profile-popover.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfilePopoverComponent {
  readonly popover = inject(UserProfilePopoverService);
  readonly presentation = inject(ChatMessagePresentationService);
  readonly chatList = inject(ChatListService);
  readonly twitchViewerCard = inject(TwitchViewerCardService);
  readonly kickChat = inject(KickChatService);
  readonly youtubeChat = inject(YouTubeChatService);

  /** Applied after anchor-based placement; clamped inside the viewport. */
  readonly panelOffsetX = signal(0);
  readonly panelOffsetY = signal(0);

  /** Drag state for movable panel */
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  /** User info by platform */
  readonly twitchUserInfo = signal<TwitchUserInfo | null>(null);
  readonly twitchUserInfoLoading = signal(false);
  readonly twitchUserBadges = signal<ChatBadgeIcon[]>([]);

  readonly kickUserInfo = signal<KickUserInfo | null>(null);
  readonly kickUserInfoLoading = signal(false);

  readonly youtubeUserInfo = signal<{ id: string; name: string; photoUrl?: string } | null>(null);
  readonly youtubeUserInfoLoading = signal(false);
  readonly channelInfo = signal<{ name: string; imageUrl?: string } | null>(null);

  readonly showChannelLabels = computed(() => false); // Not used in text-only mode

  readonly layout = computed((): UserProfilePanelLayout | null => {
    this.popover.anchorRect();
    this.popover.useSavedPosition();
    this.panelOffsetX();
    this.panelOffsetY();
    const st = this.popover.open();
    const rect = this.popover.anchorRect();
    if (!st) {
      return null;
    }

    // Use saved position if available
    if (this.popover.useSavedPosition() && st.savedPosition) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(PANEL_WIDTH, vw - 2 * VIEW_PAD);
      const height = Math.min(PANEL_HEIGHT, vh - 2 * VIEW_PAD);
      let left = st.savedPosition.left + this.panelOffsetX();
      let top = st.savedPosition.top + this.panelOffsetY();
      left = Math.max(VIEW_PAD, Math.min(left, vw - width - VIEW_PAD));
      top = Math.max(VIEW_PAD, Math.min(top, vh - height - VIEW_PAD));
      return {
        left: Math.floor(left),
        top: Math.floor(top),
        width: Math.floor(width),
        height: Math.floor(height),
      };
    }

    if (!rect) {
      return null;
    }
    const base = this.computeAnchorBase(rect);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = base.left + this.panelOffsetX();
    let top = base.top + this.panelOffsetY();
    left = Math.max(VIEW_PAD, Math.min(left, vw - base.width - VIEW_PAD));
    top = Math.max(VIEW_PAD, Math.min(top, vh - base.height - VIEW_PAD));
    return {
      left: Math.floor(left),
      top: Math.floor(top),
      width: base.width,
      height: base.height,
    };
  });

  constructor() {
    effect(() => {
      if (!this.popover.open()) {
        this.panelOffsetX.set(0);
        this.panelOffsetY.set(0);
      }
    });

    effect((onCleanup) => {
      if (!this.popover.open()) {
        return;
      }
      const onMove = () => this.popover.syncAnchorRect();
      window.addEventListener("scroll", onMove, true);
      window.addEventListener("resize", onMove);
      onCleanup(() => {
        window.removeEventListener("scroll", onMove, true);
        window.removeEventListener("resize", onMove);
      });
    });

    effect((onCleanup) => {
      const st = this.popover.open();
      if (!st) {
        this.twitchUserInfo.set(null);
        this.twitchUserInfoLoading.set(false);
        this.twitchUserBadges.set([]);
        this.kickUserInfo.set(null);
        this.kickUserInfoLoading.set(false);
        this.youtubeUserInfo.set(null);
        this.youtubeUserInfoLoading.set(false);
        this.channelInfo.set(null);
        return;
      }

      // Reset all platform states based on message platform
      if (st.message.platform !== "twitch") {
        this.twitchUserInfo.set(null);
        this.twitchUserInfoLoading.set(false);
        this.twitchUserBadges.set([]);
      }
      if (st.message.platform !== "kick") {
        this.kickUserInfo.set(null);
        this.kickUserInfoLoading.set(false);
      }
      if (st.message.platform !== "youtube") {
        this.youtubeUserInfo.set(null);
        this.youtubeUserInfoLoading.set(false);
      }

      // Auto-load user info when opening card
      void this.loadUserInfo();
      void this.loadChannelInfo();
    });
  }

  /** Load user info for the current platform */
  async loadUserInfo(): Promise<void> {
    const st = this.popover.open();
    if (!st) {
      return;
    }

    const platform = st.message.platform;
    const username = st.message.author;

    if (platform === "twitch") {
      this.twitchUserInfoLoading.set(true);
      try {
        const channelLogin = st.message.sourceChannelId;
        const userInfo =
          (channelLogin
            ? await this.twitchViewerCard.fetchTwitchViewerCard(channelLogin, username)
            : null) ?? (await this.twitchViewerCard.fetchUserInfo(username));
        if (userInfo) {
          this.twitchUserInfo.set(userInfo);
        } else {
          // Fallback to basic info
          this.twitchUserInfo.set({
            id: st.message.sourceUserId,
            login: username.toLowerCase(),
            display_name: username,
            description: "",
            profile_image_url: "",
            offline_image_url: "",
            banner: null,
            created_at: "",
          });
        }
        this.twitchUserBadges.set([]);
      } catch {
        this.twitchUserInfo.set(null);
        this.twitchUserBadges.set([]);
      } finally {
        this.twitchUserInfoLoading.set(false);
      }
    } else if (platform === "kick") {
      this.kickUserInfoLoading.set(true);
      try {
        const userInfo = await this.kickChat.fetchUserInfo(username);
        this.kickUserInfo.set(userInfo);
      } catch {
        this.kickUserInfo.set(null);
      } finally {
        this.kickUserInfoLoading.set(false);
      }
    } else if (platform === "youtube") {
      this.youtubeUserInfoLoading.set(true);
      try {
        // YouTube user info - use the author name from the message
        this.youtubeUserInfo.set({
          id: st.message.sourceUserId,
          name: username,
          photoUrl: st.message.authorAvatarUrl,
        });
      } catch {
        this.youtubeUserInfo.set(null);
      } finally {
        this.youtubeUserInfoLoading.set(false);
      }
    }
  }

  async loadChannelInfo(): Promise<void> {
    const st = this.popover.open();
    if (!st) {
      return;
    }

    const channel = this.chatList
      .getChannels(st.message.platform)
      .find((entry) => entry.channelId === st.message.sourceChannelId);
    const fallbackName = channel?.channelName ?? st.message.sourceChannelId;

    if (st.message.platform === "twitch") {
      const imageUrl =
        (await this.twitchViewerCard.fetchChannelProfileImage(fallbackName)) ?? undefined;
      this.channelInfo.set({ name: fallbackName, imageUrl: imageUrl || undefined });
      return;
    }

    if (st.message.platform === "kick") {
      const info = await this.kickChat.fetchUserInfo(fallbackName);
      this.channelInfo.set({
        name: fallbackName,
        imageUrl: info?.profile_pic_url || undefined,
      });
      return;
    }

    if (st.message.platform === "youtube") {
      this.channelInfo.set({
        name: fallbackName,
        imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(st.message.sourceChannelId)}/default.jpg`,
      });
      return;
    }

    this.channelInfo.set({ name: fallbackName });
  }

  /** Prefer right of the nickname; flip left if needed; clamp into the viewport. */
  private computeAnchorBase(rect: DOMRectReadOnly): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_WIDTH, vw - 2 * VIEW_PAD);
    const height = Math.min(PANEL_HEIGHT, vh - 2 * VIEW_PAD);

    let left = rect.right + GAP;
    if (left + width > vw - VIEW_PAD) {
      left = rect.left - GAP - width;
    }
    left = Math.max(VIEW_PAD, Math.min(left, vw - width - VIEW_PAD));

    let top = rect.top;
    top = Math.max(VIEW_PAD, Math.min(top, vh - height - VIEW_PAD));

    return {
      left: Math.floor(left),
      top: Math.floor(top),
      width: Math.floor(width),
      height: Math.floor(height),
    };
  }

  /** Start dragging the panel */
  onStartDrag(event: MouseEvent): void {
    if (event.button !== 0) return; // Only left mouse button

    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragOffsetX = this.panelOffsetX();
    this.dragOffsetY = this.panelOffsetY();

    // Add global drag listeners
    document.addEventListener("mousemove", this.onDrag);
    document.addEventListener("mouseup", this.onStopDrag);

    event.preventDefault();
    event.stopPropagation();
  }

  /** Handle drag movement */
  private onDrag = (event: MouseEvent): void => {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    this.panelOffsetX.set(this.dragOffsetX + deltaX);
    this.panelOffsetY.set(this.dragOffsetY + deltaY);
  };

  /** Stop dragging and save position */
  private onStopDrag = (event: MouseEvent): void => {
    if (!this.isDragging) return;

    this.isDragging = false;

    // Remove global drag listeners
    document.removeEventListener("mousemove", this.onDrag);
    document.removeEventListener("mouseup", this.onStopDrag);

    // Save the final position
    const st = this.popover.open();
    if (st) {
      const finalLeft = (st.savedPosition?.left ?? 0) + this.panelOffsetX();
      const finalTop = (st.savedPosition?.top ?? 0) + this.panelOffsetY();
      this.popover.saveCurrentPosition(finalLeft, finalTop);
    }
  };
}
