import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class HighlightNotificationService {
  private _prefs = signal<{
    soundEnabled: boolean;
    desktopEnabled: boolean;
    onlyWhenBackground: boolean;
    enabled: boolean;
  }>({
    soundEnabled: true,
    desktopEnabled: true,
    onlyWhenBackground: false,
    enabled: true,
  });
  readonly prefs = this._prefs.asReadonly();

  notify(messageId: string): void {}
  maybeNotify(messageId: string): void {
    this.notify(messageId);
  }
  setEnabled(enabled: boolean): void {
    this._prefs.update((p) => ({ ...p, soundEnabled: enabled, enabled }));
  }
  setOnlyWhenBackground(only: boolean): void {
    this._prefs.update((p) => ({ ...p, onlyWhenBackground: only }));
  }
}
