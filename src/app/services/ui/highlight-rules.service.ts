import { Injectable, signal } from "@angular/core";

export interface HighlightRule {
  id: string;
  pattern: string;
  style: string;
  notify: boolean;
  color?: string;
  channelIds?: string[];
  isRegex?: boolean;
  isGlobal?: boolean;
  enabled?: boolean;
}

@Injectable({ providedIn: "root" })
export class HighlightRulesService {
  private _rules = signal<HighlightRule[]>([]);
  readonly rules = this._rules.asReadonly();

  getRules(): HighlightRule[] {
    return this._rules();
  }
  addRule(rule: HighlightRule): void {
    this._rules.update((rules) => [...rules, rule]);
  }
  removeRule(ruleId: string): void {
    this._rules.update((rules) => rules.filter((r) => r.id !== ruleId));
  }
  deleteRule(ruleId: string): void {
    this.removeRule(ruleId);
  }
  updateRule(ruleId: string, updates: Partial<HighlightRule>): void {
    this._rules.update((rules) => rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)));
  }
  toggleRule(ruleId: string): void {
    this._rules.update((rules) =>
      rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
    );
  }
  getHighlightColor(message: string, author?: string, platform?: string): string {
    return "#ffff00";
  }
}
