import { Injectable, signal } from "@angular/core";
import { ChatMessage, UserProfileState } from "@models/chat.model";

export interface UserProfilePopoverOpenState {
  anchor: HTMLElement;
  message: ChatMessage;
  savedPosition?: { left: number; top: number };
}

export interface UserProfileProfileState {
  loading: boolean;
  hasMoreMessages: boolean;
  loadedMessageCount: number;
  lastLoadedTimestamp?: string;
  isLoadingMore: boolean;
}

@Injectable({
  providedIn: "root",
})
export class UserProfilePopoverService {
  private readonly openState = signal<UserProfilePopoverOpenState | null>(null);
  /** Viewport rect of the username anchor; updated on open and while open (scroll/resize). */
  readonly anchorRect = signal<DOMRectReadOnly | null>(null);
  /** Whether to use saved position instead of anchor-based positioning */
  readonly useSavedPosition = signal(false);
  /** Profile state for tracking loaded messages and pagination */
  readonly profileState = signal<UserProfileProfileState>({
    loading: false,
    hasMoreMessages: true,
    loadedMessageCount: 0,
    lastLoadedTimestamp: undefined,
    isLoadingMore: false,
  });

  readonly open = this.openState.asReadonly();
  readonly profile = this.profileState.asReadonly();

  toggle(anchor: HTMLElement, message: ChatMessage): void {
    const cur = this.openState();
    if (
      cur &&
      cur.message.platform === message.platform &&
      cur.message.sourceUserId === message.sourceUserId
    ) {
      this.close();
      return;
    }
    // Preserve saved position if reopening for same user
    const savedPosition =
      cur?.message.sourceUserId === message.sourceUserId ? cur?.savedPosition : undefined;
    // Reset profile state when opening for a different user
    if (cur?.message.sourceUserId !== message.sourceUserId) {
      this.profileState.set({
        loading: false,
        hasMoreMessages: true,
        loadedMessageCount: 0,
        lastLoadedTimestamp: undefined,
        isLoadingMore: false,
      });
    }
    this.openState.set({ anchor, message, savedPosition });
    if (!savedPosition) {
      this.anchorRect.set(anchor.getBoundingClientRect());
      this.useSavedPosition.set(false);
    } else {
      this.useSavedPosition.set(true);
    }
  }

  saveCurrentPosition(left: number, top: number): void {
    const st = this.openState();
    if (st) {
      this.openState.set({ ...st, savedPosition: { left, top } });
      this.useSavedPosition.set(true);
    }
  }

  syncAnchorRect(): void {
    const st = this.openState();
    if (st && !this.useSavedPosition()) {
      this.anchorRect.set(st.anchor.getBoundingClientRect());
    }
  }

  close(): void {
    this.openState.set(null);
    this.anchorRect.set(null);
    this.useSavedPosition.set(false);
  }

  updateProfileState(updates: Partial<UserProfileProfileState>): void {
    this.profileState.update((state) => ({ ...state, ...updates }));
  }

  resetProfileState(): void {
    this.profileState.set({
      loading: false,
      hasMoreMessages: true,
      loadedMessageCount: 0,
      lastLoadedTimestamp: undefined,
      isLoadingMore: false,
    });
  }
}
