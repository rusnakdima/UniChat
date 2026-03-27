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
import { UserProfilePopoverService } from "@services/ui/user-profile-popover.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ChatBadgeIcon } from "@models/chat.model";

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

export interface TwitchUserInfo {
  id: string;
  login: string;
  display_name: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  banner?: string | null;
  created_at: string;
}

@Component({
  selector: "app-user-profile-popover",
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: "./user-profile-popover.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserProfilePopoverComponent {
  readonly popover = inject(UserProfilePopoverService);
  readonly presentation = inject(ChatMessagePresentationService);

  /** Applied after anchor-based placement; clamped inside the viewport. */
  readonly panelOffsetX = signal(0);
  readonly panelOffsetY = signal(0);

  /** Twitch: user info (text only) */
  readonly twitchUserInfo = signal<TwitchUserInfo | null>(null);
  readonly twitchUserInfoLoading = signal(false);
  readonly twitchUserBadges = signal<ChatBadgeIcon[]>([]);

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
        return;
      }
      if (st.message.platform !== "twitch") {
        this.twitchUserInfo.set(null);
        this.twitchUserInfoLoading.set(false);
        this.twitchUserBadges.set([]);
        return;
      }
      // Auto-load user info when opening card for Twitch users
      this.twitchUserInfo.set(null);
      this.twitchUserInfoLoading.set(false);
      this.twitchUserBadges.set([]);

      // Load user info (text only)
      void this.loadUserInfo();
    });
  }

  /** Load user info - text only, no images or badges */
  async loadUserInfo(): Promise<void> {
    const st = this.popover.open();
    if (!st || st.message.platform !== "twitch") {
      return;
    }
    this.twitchUserInfoLoading.set(true);
    try {
      const targetLogin = st.message.author;

      // Set basic user info (text only)
      this.twitchUserInfo.set({
        id: st.message.sourceUserId,
        login: targetLogin.toLowerCase(),
        display_name: st.message.author,
        description: "",
        profile_image_url: "", // No image
        offline_image_url: "",
        banner: null,
        created_at: "",
      });

      // No badges loaded - text only display
      this.twitchUserBadges.set([]);
    } catch {
      // Silently handle errors
      this.twitchUserInfo.set(null);
      this.twitchUserBadges.set([]);
    } finally {
      this.twitchUserInfoLoading.set(false);
    }
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
}
