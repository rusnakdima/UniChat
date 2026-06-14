/* sys lib */
import { Injectable, inject, signal } from "@angular/core";

/* models */
import { ChatMessage } from "@models/chat.model";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";
import { HighlightRulesService } from "@services/ui/highlight-rules.service";

/* utils */
import { buildChannelRef } from "@utils/channel-ref.util";
import {
  MAX_NOTIFICATION_TEXT_LENGTH,
  MAX_NOTIFICATION_TEXT_TRUNCATE,
} from "@shared/utils/constants";

const STORAGE_KEY = "unichat.highlightNotifications.v1";

export interface HighlightNotificationPrefs {
  enabled: boolean;
  onlyWhenBackground: boolean;
}

@Injectable({
  providedIn: "root",
})
export class HighlightNotificationService {
  private readonly rules = inject(HighlightRulesService);
  private readonly localStorageService = inject(LocalStorageService);

  private readonly prefsSignal = signal<HighlightNotificationPrefs>(this.loadPrefs());

  readonly prefs = this.prefsSignal.asReadonly();

  setEnabled(enabled: boolean): void {
    this.prefsSignal.update((p) => ({ ...p, enabled }));
    this.persist();
    if (enabled && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  setOnlyWhenBackground(value: boolean): void {
    this.prefsSignal.update((p) => ({ ...p, onlyWhenBackground: value }));
    this.persist();
  }

  maybeNotify(message: ChatMessage): void {
    const { enabled, onlyWhenBackground } = this.prefsSignal();
    if (!enabled || typeof Notification === "undefined") {
      return;
    }
    if (onlyWhenBackground && typeof document !== "undefined" && !document.hidden) {
      return;
    }

    const channelRef = buildChannelRef(message.platform, message.sourceChannelId);
    if (!this.rules.wouldBeHighlighted(message.text, message.author, channelRef)) {
      return;
    }

    if (Notification.permission === "denied") {
      return;
    }
    if (Notification.permission === "default") {
      void Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          this.showNotification(message);
        }
      });
      return;
    }

    this.showNotification(message);
  }

  private showNotification(message: ChatMessage): void {
    const title = `Highlight: ${message.author}`;
    const body =
      message.text.length > MAX_NOTIFICATION_TEXT_LENGTH
        ? `${message.text.slice(0, MAX_NOTIFICATION_TEXT_TRUNCATE)}…`
        : message.text || "(no text)";
    try {
      new Notification(title, { body, tag: message.id });
    } catch {
      /* Notification constructor can throw in restricted contexts */
    }
  }

  private loadPrefs(): HighlightNotificationPrefs {
    return this.localStorageService.get(STORAGE_KEY, {
      enabled: false,
      onlyWhenBackground: true,
    });
  }

  private persist(): void {
    this.localStorageService.set(STORAGE_KEY, this.prefsSignal());
  }
}
