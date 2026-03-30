/* sys lib */
import { Injectable, inject, signal, computed } from "@angular/core";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";

export type ShortcutActionId =
  | "open-search"
  | "open-pinned"
  | "toggle-feed-mode"
  | "close-modals"
  | "send-message"
  | "reply-selected"
  | "delete-selected"
  | "open-overlay-settings"
  | "show-shortcuts";

export interface KeyboardShortcutAction {
  id: ShortcutActionId;
  description: string;
  category: "navigation" | "actions" | "overlay" | "general";
}

export interface KeyboardShortcutBinding {
  /** Stable row id (persists user key overrides). */
  bindingId: string;
  actionId: ShortcutActionId;
  keys: string;
}

export interface KeyboardShortcutView {
  bindingId: string;
  actionId: ShortcutActionId;
  keys: string;
  description: string;
  category: KeyboardShortcutAction["category"];
}

const STORAGE_KEY = "unichat.keyboardShortcutBindings.v1";

export const KEYBOARD_SHORTCUT_ACTIONS: Record<
  ShortcutActionId,
  Omit<KeyboardShortcutAction, "id">
> = {
  "open-search": { description: "Open search", category: "navigation" },
  "open-pinned": { description: "Open pinned messages", category: "navigation" },
  "toggle-feed-mode": { description: "Toggle mixed/split view", category: "navigation" },
  "close-modals": { description: "Close modal/panel", category: "navigation" },
  "send-message": { description: "Send message", category: "actions" },
  "reply-selected": { description: "Reply to selected message", category: "actions" },
  "delete-selected": { description: "Delete selected message", category: "actions" },
  "open-overlay-settings": { description: "Open overlay settings", category: "overlay" },
  "show-shortcuts": { description: "Show keyboard shortcuts", category: "general" },
};

export const DEFAULT_KEYBOARD_BINDINGS: KeyboardShortcutBinding[] = [
  { bindingId: "bind-open-search", actionId: "open-search", keys: "Ctrl+K" },
  { bindingId: "bind-open-pinned", actionId: "open-pinned", keys: "Ctrl+P" },
  { bindingId: "bind-toggle-feed", actionId: "toggle-feed-mode", keys: "Ctrl+M" },
  { bindingId: "bind-close-modals", actionId: "close-modals", keys: "Escape" },
  { bindingId: "bind-send", actionId: "send-message", keys: "Ctrl+Enter" },
  { bindingId: "bind-reply", actionId: "reply-selected", keys: "Ctrl+R" },
  { bindingId: "bind-delete", actionId: "delete-selected", keys: "Delete" },
  { bindingId: "bind-overlay", actionId: "open-overlay-settings", keys: "Ctrl+O" },
  { bindingId: "bind-shortcuts-ctrl", actionId: "show-shortcuts", keys: "Shift+?" },
  { bindingId: "bind-shortcuts-f1", actionId: "show-shortcuts", keys: "F1" },
];

/**
 * Keyboard Shortcuts Service - Global Hotkey Management
 *
 * Responsibility: Manages keyboard shortcuts across the application.
 * Provides a centralized way to register, unregister, and trigger shortcuts.
 */
@Injectable({
  providedIn: "root",
})
export class KeyboardShortcutsService {
  private readonly localStorageService = inject(LocalStorageService);

  private readonly bindingsSignal = signal<KeyboardShortcutBinding[]>(this.loadBindings());

  private readonly actionHandlers = new Map<ShortcutActionId, (event: KeyboardEvent) => void>();
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;

  readonly bindings = this.bindingsSignal.asReadonly();

  readonly shortcuts = computed(() => this.bindingsToViews(this.bindingsSignal()));

  readonly shortcutsByCategory = computed(() => {
    const shortcuts = this.shortcuts();
    return {
      navigation: shortcuts.filter((s) => s.category === "navigation"),
      actions: shortcuts.filter((s) => s.category === "actions"),
      overlay: shortcuts.filter((s) => s.category === "overlay"),
      general: shortcuts.filter((s) => s.category === "general"),
    };
  });

  /**
   * Register handler for an action. One handler per action (latest wins).
   * Returns cleanup.
   */
  registerAction(actionId: ShortcutActionId, handler: (event: KeyboardEvent) => void): () => void {
    this.actionHandlers.set(actionId, handler);
    this.ensureGlobalKeyListener();
    return () => {
      this.actionHandlers.delete(actionId);
      if (this.actionHandlers.size === 0) {
        this.removeGlobalKeyListener();
      }
    };
  }

  /**
   * @deprecated Use `registerAction` with `ShortcutActionId`.
   */
  register(keys: string, handler: (event: KeyboardEvent) => void): () => void {
    const normalized = this.normalizeKeys(keys);
    const keydownHandler = (event: KeyboardEvent) => {
      if (this.matchesShortcut(event, normalized)) {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
      }
    };
    window.addEventListener("keydown", keydownHandler);
    return () => {
      window.removeEventListener("keydown", keydownHandler);
    };
  }

  updateBindingKeys(bindingId: string, keys: string): boolean {
    const trimmed = keys.trim();
    if (!trimmed) {
      return false;
    }
    const normalizedNew = this.normalizeKeys(trimmed);
    const current = this.bindingsSignal();
    for (const b of current) {
      if (b.bindingId !== bindingId && this.normalizeKeys(b.keys) === normalizedNew) {
        return false;
      }
    }
    this.bindingsSignal.update((rows) =>
      rows.map((b) => (b.bindingId === bindingId ? { ...b, keys: trimmed } : b))
    );
    this.persistBindings();
    return true;
  }

  resetBindingsToDefaults(): void {
    this.bindingsSignal.set([...DEFAULT_KEYBOARD_BINDINGS]);
    this.localStorageService.remove(STORAGE_KEY);
  }

  private loadBindings(): KeyboardShortcutBinding[] {
    const stored = this.localStorageService.get<Partial<Record<string, string>> | null>(
      STORAGE_KEY,
      null
    );
    const base = DEFAULT_KEYBOARD_BINDINGS.map((b) => ({ ...b }));
    if (!stored) {
      return base;
    }
    return base.map((b) => {
      const override = stored[b.bindingId];
      return override ? { ...b, keys: override } : b;
    });
  }

  private persistBindings(): void {
    const map: Record<string, string> = {};
    for (const b of this.bindingsSignal()) {
      const def = DEFAULT_KEYBOARD_BINDINGS.find((d) => d.bindingId === b.bindingId);
      if (def && this.normalizeKeys(b.keys) !== this.normalizeKeys(def.keys)) {
        map[b.bindingId] = b.keys;
      }
    }
    if (Object.keys(map).length === 0) {
      this.localStorageService.remove(STORAGE_KEY);
    } else {
      this.localStorageService.set(STORAGE_KEY, map);
    }
  }

  private bindingsToViews(bindings: KeyboardShortcutBinding[]): KeyboardShortcutView[] {
    return bindings.map((b) => {
      const meta = KEYBOARD_SHORTCUT_ACTIONS[b.actionId];
      return {
        bindingId: b.bindingId,
        actionId: b.actionId,
        keys: b.keys,
        description: meta.description,
        category: meta.category,
      };
    });
  }

  private ensureGlobalKeyListener(): void {
    if (this.keydownListener) {
      return;
    }
    this.keydownListener = (event: KeyboardEvent) => {
      const pressed = this.normalizeKeys(this.eventToKeys(event));
      for (const b of this.bindingsSignal()) {
        if (this.normalizeKeys(b.keys) !== pressed) {
          continue;
        }
        const handler = this.actionHandlers.get(b.actionId);
        if (handler) {
          event.preventDefault();
          event.stopPropagation();
          handler(event);
        }
        return;
      }
    };
    window.addEventListener("keydown", this.keydownListener);
  }

  private removeGlobalKeyListener(): void {
    if (this.keydownListener) {
      window.removeEventListener("keydown", this.keydownListener);
      this.keydownListener = null;
    }
  }

  private matchesShortcut(event: KeyboardEvent, shortcutKeys: string): boolean {
    const pressedKeys = this.normalizeKeys(this.eventToKeys(event));
    return pressedKeys === shortcutKeys;
  }

  private eventToKeys(event: KeyboardEvent): string {
    const keys: string[] = [];

    if (event.ctrlKey) keys.push("Ctrl");
    if (event.altKey) keys.push("Alt");
    if (event.shiftKey) keys.push("Shift");
    if (event.metaKey) keys.push("Meta");

    const key = this.getPrimaryKey(event);
    if (!["CONTROL", "ALT", "SHIFT", "META"].includes(key)) {
      keys.push(key);
    }

    return keys.join("+");
  }

  normalizeKeys(keys: string): string {
    return keys
      .split("+")
      .flatMap((k) => this.expandKeyToken(k))
      .sort((a, b) => {
        const modifiers = ["CTRL", "ALT", "SHIFT", "META"];
        const aIsMod = modifiers.includes(a);
        const bIsMod = modifiers.includes(b);
        if (aIsMod && !bIsMod) return -1;
        if (!aIsMod && bIsMod) return 1;
        return a.localeCompare(b);
      })
      .join("+");
  }

  private getPrimaryKey(event: KeyboardEvent): string {
    const key = event.key.toUpperCase();

    // `?` is typically produced by Shift+/, so canonicalize it to `/`
    // and let the modifier list carry the `Shift` portion.
    if (key === "?" || event.code === "Slash") {
      return "/";
    }

    return key;
  }

  private expandKeyToken(token: string): string[] {
    const normalized = token.trim().toUpperCase();

    if (!normalized) {
      return [];
    }

    if (normalized === "?") {
      return ["SHIFT", "/"];
    }

    if (normalized === "SLASH") {
      return ["/"];
    }

    return [normalized];
  }
}
