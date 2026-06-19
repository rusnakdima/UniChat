import { Injectable, signal } from "@angular/core";

export interface BlockedWordRule {
  id: string;
  pattern: string;
  action: "hide" | "delete" | "warn";
  channelIds?: string[];
  isRegex?: boolean;
  isGlobal?: boolean;
  replacement?: string;
  enabled?: boolean;
  isActive?: boolean;
}

@Injectable({ providedIn: "root" })
export class BlockedWordsService {
  private _rules = signal<BlockedWordRule[]>([]);
  readonly rules = computed(() => this._rules());

  getRules(): BlockedWordRule[] {
    return this._rules();
  }

  addRule(rule: BlockedWordRule): void {
    this._rules.update((rules) => [...rules, rule]);
  }
  removeRule(ruleId: string): void {
    this._rules.update((rules) => rules.filter((r) => r.id !== ruleId));
  }
  deleteRule(ruleId: string): void {
    this.removeRule(ruleId);
  }
  updateRule(ruleId: string, updates: Partial<BlockedWordRule>): void {
    this._rules.update((rules) => rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)));
  }
  toggleRule(ruleId: string): void {
    this._rules.update((rules) =>
      rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  }
  filterMessage(text: string, storageKey: string): { filtered: string; wasFiltered: boolean } {
    return { filtered: text, wasFiltered: false };
  }
}

function computed<T>(fn: () => T): import("@angular/core").Signal<T> {
  return signal(fn()) as import("@angular/core").Signal<T>;
}
