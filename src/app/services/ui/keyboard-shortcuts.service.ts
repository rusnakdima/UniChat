import { Injectable } from '@angular/core';

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

export interface KeyboardShortcutsByCategory {
  [category: string]: KeyboardAction[];
}

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService {
  private _shortcuts = new Map<string, KeyboardShortcut>();
  private _actions = new Map<string, KeyboardAction>();

  getShortcuts(): KeyboardShortcut[] { return Array.from(this._shortcuts.values()); }
  registerShortcut(shortcut: KeyboardShortcut): void { this._shortcuts.set(shortcut.key, shortcut); }
  unregisterShortcut(key: string): void { this._shortcuts.delete(key); }
  registerAction(action: KeyboardAction): void { this._actions.set(action.id, action); }
  getAction(id: string): KeyboardAction | undefined { return this._actions.get(id); }
  updateBindingKeys(actionId: string, keyBinding: string): void {
    const action = this._actions.get(actionId);
    if (action) this._actions.set(actionId, { ...action, keyBinding });
  }
  resetBindingsToDefaults(): void { this._actions.clear(); }
  get shortcutsByCategory(): KeyboardShortcutsByCategory { return {}; }
}
