import { Injectable, signal, computed, inject } from "@angular/core";
import { LocalStorageService } from "@services/core/local-storage.service";

export interface HighlightRule {
  id: string;
  pattern: string;
  isRegex: boolean;
  isGlobal: boolean;
  channelIds?: string[]; // If not global, apply only to these channels
  color: string; // CSS color for highlight
  isActive: boolean;
  createdAt: string;
}

const HIGHLIGHT_RULES_STORAGE_KEY = "unichat.highlightRules.v1";

/**
 * Highlight Rules Service - Message Highlighting
 *
 * Responsibility: Manages highlight rules for emphasizing important chat messages.
 * Supports both simple string matching and regex patterns.
 * Rules can be global or channel-specific.
 */
@Injectable({
  providedIn: "root",
})
export class HighlightRulesService {
  private readonly localStorageService = inject(LocalStorageService);

  private readonly rulesSignal = signal<HighlightRule[]>([]);

  readonly rules = this.rulesSignal.asReadonly();
  
  readonly activeRules = computed(() => 
    this.rulesSignal().filter(rule => rule.isActive)
  );

  readonly globalRules = computed(() =>
    this.activeRules().filter(rule => rule.isGlobal)
  );

  constructor() {
    this.loadRules();
  }

  private loadRules(): void {
    const stored = this.localStorageService.get<HighlightRule[]>(HIGHLIGHT_RULES_STORAGE_KEY, []);
    this.rulesSignal.set(stored);
  }

  private persistRules(): void {
    this.localStorageService.set(HIGHLIGHT_RULES_STORAGE_KEY, this.rulesSignal());
  }

  /**
   * Add a new highlight rule
   */
  addRule(rule: Omit<HighlightRule, "id" | "createdAt">): HighlightRule {
    const newRule: HighlightRule = {
      ...rule,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
    };
    this.rulesSignal.update(rules => [...rules, newRule]);
    this.persistRules();
    return newRule;
  }

  /**
   * Update an existing rule
   */
  updateRule(ruleId: string, updates: Partial<HighlightRule>): void {
    this.rulesSignal.update(rules =>
      rules.map(rule =>
        rule.id === ruleId ? { ...rule, ...updates } : rule
      )
    );
    this.persistRules();
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): void {
    this.rulesSignal.update(rules => rules.filter(rule => rule.id !== ruleId));
    this.persistRules();
  }

  /**
   * Toggle rule active state
   */
  toggleRule(ruleId: string): void {
    this.rulesSignal.update(rules =>
      rules.map(rule =>
        rule.id === ruleId ? { ...rule, isActive: !rule.isActive } : rule
      )
    );
    this.persistRules();
  }

  /**
   * Check if a message should be highlighted and return the highlight color
   * Returns null if no highlight matches
   */
  getHighlightColor(text: string, author: string, channelId: string): string | null {
    const applicableRules = this.activeRules().filter(
      rule => rule.isGlobal || rule.channelIds?.includes(channelId)
    );

    const lowerText = text.toLowerCase();
    const lowerAuthor = author.toLowerCase();

    for (const rule of applicableRules) {
      if (!rule.pattern.trim()) {
        continue;
      }

      try {
        if (rule.isRegex) {
          const regex = new RegExp(rule.pattern, "i");
          if (regex.test(text) || regex.test(author)) {
            return rule.color;
          }
        } else {
          // Simple string matching (case-insensitive)
          const lowerPattern = rule.pattern.toLowerCase();
          if (lowerText.includes(lowerPattern) || lowerAuthor.includes(lowerPattern)) {
            return rule.color;
          }
        }
      } catch (error) {
        console.warn(`[HighlightRules] Invalid regex pattern: ${rule.pattern}`, error);
      }
    }

    return null;
  }

  /**
   * Check if a message would be highlighted
   */
  wouldBeHighlighted(text: string, author: string, channelId: string): boolean {
    return this.getHighlightColor(text, author, channelId) !== null;
  }

  /**
   * Get rules that apply to a specific channel
   */
  getRulesForChannel(channelId: string): HighlightRule[] {
    return this.activeRules().filter(
      rule => rule.isGlobal || rule.channelIds?.includes(channelId)
    );
  }

  private generateId(): string {
    return `hl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
