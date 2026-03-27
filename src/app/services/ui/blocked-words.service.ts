import { Injectable, signal, computed, inject } from "@angular/core";
import { LocalStorageService } from "@services/core/local-storage.service";

export interface BlockedWordRule {
  id: string;
  pattern: string;
  isRegex: boolean;
  isGlobal: boolean;
  channelIds?: string[]; // If not global, apply only to these channels
  replacement: string;
  isActive: boolean;
  createdAt: string;
}

const BLOCKED_WORDS_STORAGE_KEY = "unichat.blockedWords.v1";

/**
 * Blocked Words Service - Message Filtering
 *
 * Responsibility: Manages blocked words and regex patterns for filtering chat messages.
 * Supports both simple string matching and regex patterns.
 * Rules can be global or channel-specific.
 */
@Injectable({
  providedIn: "root",
})
export class BlockedWordsService {
  private readonly localStorageService = inject(LocalStorageService);

  private readonly rulesSignal = signal<BlockedWordRule[]>([]);

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
    const stored = this.localStorageService.get<BlockedWordRule[]>(BLOCKED_WORDS_STORAGE_KEY, []);
    this.rulesSignal.set(stored);
  }

  private persistRules(): void {
    this.localStorageService.set(BLOCKED_WORDS_STORAGE_KEY, this.rulesSignal());
  }

  /**
   * Add a new blocked word rule
   */
  addRule(rule: Omit<BlockedWordRule, "id" | "createdAt">): BlockedWordRule {
    const newRule: BlockedWordRule = {
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
  updateRule(ruleId: string, updates: Partial<BlockedWordRule>): void {
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
   * Filter a message text, replacing blocked words
   * Returns the filtered text and whether any replacements were made
   */
  filterMessage(text: string, channelId: string): { filtered: string; wasFiltered: boolean } {
    const applicableRules = this.activeRules().filter(
      rule => rule.isGlobal || rule.channelIds?.includes(channelId)
    );

    let filtered = text;
    let wasFiltered = false;

    for (const rule of applicableRules) {
      if (!rule.pattern.trim()) {
        continue;
      }

      try {
        if (rule.isRegex) {
          const regex = new RegExp(rule.pattern, "gi");
          if (regex.test(filtered)) {
            wasFiltered = true;
            filtered = filtered.replace(regex, rule.replacement);
          }
        } else {
          // Simple string replacement (case-insensitive)
          const escapedPattern = this.escapeRegExp(rule.pattern);
          const regex = new RegExp(escapedPattern, "gi");
          if (regex.test(filtered)) {
            wasFiltered = true;
            filtered = filtered.replace(regex, rule.replacement);
          }
        }
      } catch (error) {
        console.warn(`[BlockedWords] Invalid regex pattern: ${rule.pattern}`, error);
      }
    }

    return { filtered, wasFiltered };
  }

  /**
   * Check if a message would be filtered (without actually filtering)
   */
  wouldBeFiltered(text: string, channelId: string): boolean {
    const { wasFiltered } = this.filterMessage(text, channelId);
    return wasFiltered;
  }

  /**
   * Get rules that apply to a specific channel
   */
  getRulesForChannel(channelId: string): BlockedWordRule[] {
    return this.activeRules().filter(
      rule => rule.isGlobal || rule.channelIds?.includes(channelId)
    );
  }

  private generateId(): string {
    return `bw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
