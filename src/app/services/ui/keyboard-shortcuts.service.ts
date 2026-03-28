/* sys lib */
import { Injectable, inject, signal, computed } from "@angular/core";

/* components */
import { ChatSearchComponent } from "@components/chat-search/chat-search.component";
export interface KeyboardShortcut {
  keys: string;
  description: string;
  category: "navigation" | "actions" | "overlay" | "general";
}

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  // Navigation
  { keys: "Ctrl+K", description: "Open search", category: "navigation" },
  { keys: "Ctrl+P", description: "Open pinned messages", category: "navigation" },
  { keys: "Ctrl+M", description: "Toggle mixed/split view", category: "navigation" },
  { keys: "Escape", description: "Close modal/panel", category: "navigation" },

  // Actions
  { keys: "Ctrl+Enter", description: "Send message", category: "actions" },
  { keys: "Ctrl+R", description: "Reply to selected message", category: "actions" },
  { keys: "Delete", description: "Delete selected message", category: "actions" },

  // Overlay
  { keys: "Ctrl+O", description: "Open overlay settings", category: "overlay" },

  // General
  { keys: "Ctrl+?", description: "Show keyboard shortcuts", category: "general" },
  { keys: "F1", description: "Show keyboard shortcuts", category: "general" },
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
  private readonly shortcutsSignal = signal<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);

  readonly shortcuts = this.shortcutsSignal.asReadonly();
  readonly shortcutsByCategory = computed(() => {
    const shortcuts = this.shortcutsSignal();
    return {
      navigation: shortcuts.filter((s) => s.category === "navigation"),
      actions: shortcuts.filter((s) => s.category === "actions"),
      overlay: shortcuts.filter((s) => s.category === "overlay"),
      general: shortcuts.filter((s) => s.category === "general"),
    };
  });

  /**
   * Register a keyboard shortcut handler
   * @param keys - Key combination (e.g., "Ctrl+K", "Alt+Shift+S")
   * @param handler - Function to call when shortcut is triggered
   */
  register(keys: string, handler: (event: KeyboardEvent) => void): () => void {
    const normalizedKeys = this.normalizeKeys(keys);

    const keydownHandler = (event: KeyboardEvent) => {
      if (this.matchesShortcut(event, normalizedKeys)) {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
      }
    };

    window.addEventListener("keydown", keydownHandler);

    // Return cleanup function
    return () => {
      window.removeEventListener("keydown", keydownHandler);
    };
  }

  /**
   * Check if a keyboard event matches a shortcut
   */
  private matchesShortcut(event: KeyboardEvent, shortcutKeys: string): boolean {
    const pressedKeys = this.normalizeKeys(this.eventToKeys(event));
    return pressedKeys === shortcutKeys;
  }

  /**
   * Convert keyboard event to key string
   */
  private eventToKeys(event: KeyboardEvent): string {
    const keys: string[] = [];

    if (event.ctrlKey) keys.push("Ctrl");
    if (event.altKey) keys.push("Alt");
    if (event.shiftKey) keys.push("Shift");
    if (event.metaKey) keys.push("Meta");

    // Get the actual key (uppercase for letters)
    const key = event.key.toUpperCase();
    if (!["CONTROL", "ALT", "SHIFT", "META"].includes(key)) {
      keys.push(key);
    }

    return keys.join("+");
  }

  /**
   * Normalize key string for comparison
   */
  private normalizeKeys(keys: string): string {
    return keys
      .split("+")
      .map((k) => k.trim().toUpperCase())
      .sort((a, b) => {
        // Modifiers first, then other keys
        const modifiers = ["CTRL", "ALT", "SHIFT", "META"];
        const aIsMod = modifiers.includes(a);
        const bIsMod = modifiers.includes(b);
        if (aIsMod && !bIsMod) return -1;
        if (!aIsMod && bIsMod) return 1;
        return a.localeCompare(b);
      })
      .join("+");
  }

  /**
   * Add custom shortcut to the list
   */
  addShortcut(shortcut: KeyboardShortcut): void {
    this.shortcutsSignal.update((shortcuts) => [...shortcuts, shortcut]);
  }

  /**
   * Remove shortcut from the list
   */
  removeShortcut(keys: string): void {
    const normalizedKeys = this.normalizeKeys(keys);
    this.shortcutsSignal.update((shortcuts) =>
      shortcuts.filter((s) => this.normalizeKeys(s.keys) !== normalizedKeys)
    );
  }
}
