import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class UserProfilePopoverService {
  private _anchorRect = signal<DOMRect | null>(null);
  private _savedPosition = signal<DOMRect | null>(null);
  readonly anchorRect = this._anchorRect();
  useSavedPosition = false;

  show(userId: string, anchorElement: HTMLElement): void {
    this._anchorRect.set(anchorElement.getBoundingClientRect());
  }
  hide(): void {
    this._anchorRect.set(null);
  }
  open(userId: string, anchorElement: HTMLElement): void {
    this.show(userId, anchorElement);
  }
  close(): void {
    this.hide();
  }
  toggle(): void {
    this._anchorRect() ? this.hide() : undefined;
  }
  saveCurrentPosition(): void {
    this._savedPosition.set(this._anchorRect());
  }
}
