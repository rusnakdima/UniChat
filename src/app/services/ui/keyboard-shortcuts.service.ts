import { Injectable } from "@angular/core";

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
}

export interface KeyboardAction {
  id: string;
  keyBinding?: string;
  description: string;
}

export interface KeyboardShortcutView {
  bindingId: string;
  keys: string;
  description: string;
  category: string;
}

export interface KeyboardShortcutsByCategory {
  navigation: KeyboardAction[];
  actions: KeyboardAction[];
  overlay: KeyboardAction[];
  general: KeyboardAction[];
}

@Injectable({ providedIn: "root" })
export class KeyboardShortcutsService {
  private _shortcuts = new Map<string, KeyboardShortcut>();
  private _actions = new Map<string, KeyboardAction>();

  getShortcuts(): KeyboardShortcut[] {
    return Array.from(this._shortcuts.values());
  }
  registerShortcut(shortcut: KeyboardShortcut): void {
    this._shortcuts.set(shortcut.key, shortcut);
  }
  unregisterShortcut(key: string): void {
    this._shortcuts.delete(key);
  }
  registerAction(id: string, action: () => void): () => void {
    this._actions.set(id, { id, description: "" });
    return () => this._actions.delete(id);
  }
  getAction(id: string): KeyboardAction | undefined {
    return this._actions.get(id);
  }
  updateBindingKeys(actionId: string, keyBinding: string): boolean {
    const action = this._actions.get(actionId);
    if (action) {
      this._actions.set(actionId, { ...action, keyBinding });
      return true;
    }
    return false;
  }
  resetBindingsToDefaults(): void {
    this._actions.clear();
  }
  get shortcutsByCategory(): KeyboardShortcutsByCategory {
    return {
      navigation: Array.from(this._actions.values()).filter((a) =>
        a.description.includes("Navigate")
      ),
      actions: Array.from(this._actions.values()).filter((a) => a.description.includes("Action")),
      overlay: Array.from(this._actions.values()).filter((a) => a.description.includes("Overlay")),
      general: Array.from(this._actions.values()).filter(
        (a) =>
          !a.description.includes("Navigate") &&
          !a.description.includes("Action") &&
          !a.description.includes("Overlay")
      ),
    };
  }
  get shortcuts(): KeyboardShortcutView[] {
    return [];
  }
}
