import { Injectable, signal } from "@angular/core";
import { ChatMessage } from "@entities/chat.model";

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

  notify(_messageId: string): void {}
  maybeNotify(message: ChatMessage): void {
    this.notify(message.id);
  }
  setEnabled(enabled: boolean): void {
    this._prefs.update((p) => ({ ...p, soundEnabled: enabled, enabled }));
  }
  setOnlyWhenBackground(only: boolean): void {
    this._prefs.update((p) => ({ ...p, onlyWhenBackground: only }));
  }
}
