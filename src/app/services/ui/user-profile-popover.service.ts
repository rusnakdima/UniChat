import { Injectable, signal, computed } from "@angular/core";
import { ChatMessage } from "@entities/chat.model";

@Injectable({ providedIn: "root" })
export class UserProfilePopoverService {
  private _anchorRect = signal<DOMRect | null>(null);
  private _savedPosition = signal<{ left: number; top: number } | null>(null);
  private _open = signal<{
    message: ChatMessage;
    savedPosition?: { left: number; top: number };
  } | null>(null);
  private _useSavedPosition = signal(false);

  readonly anchorRect = computed(() => this._anchorRect());
  useSavedPosition = (v?: boolean): boolean => {
    if (v !== undefined) this._useSavedPosition.set(v);
    return this._useSavedPosition();
  };

  open(): { message: ChatMessage; savedPosition?: { left: number; top: number } } | null {
    return this._open();
  }

  show(message: ChatMessage, anchorElement: HTMLElement): void {
    this._anchorRect.set(anchorElement.getBoundingClientRect());
    this._open.set({ message });
  }
  hide(): void {
    this._anchorRect.set(null);
    this._open.set(null);
  }
  close(): void {
    this.hide();
  }
  toggle(): void {
    if (this._open()) {
      this.hide();
    }
  }
  saveCurrentPosition(left?: number, top?: number): void {
    if (left !== undefined && top !== undefined) {
      this._savedPosition.set({ left, top });
    } else {
      const rect = this._anchorRect();
      if (rect) {
        this._savedPosition.set({ left: rect.left, top: rect.top });
      }
    }
  }
  syncAnchorRect(): void {}
}
