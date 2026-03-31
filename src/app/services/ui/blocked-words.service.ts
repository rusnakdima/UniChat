/* sys lib */
import { Injectable, signal, computed, inject, effect } from "@angular/core";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { migrateLegacyChannelRefs } from "@utils/channel-ref.util";
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
  private readonly chatListService = inject(ChatListService);

  private readonly rulesSignal = signal<BlockedWordRule[]>([]);
  private readonly compiledRegexByRuleId = new Map<string, RegExp | null>();

  readonly rules = this.rulesSignal.asReadonly();

  readonly activeRules = computed(() => this.rulesSignal().filter((rule) => rule.isActive));

  readonly globalRules = computed(() => this.activeRules().filter((rule) => rule.isGlobal));

  constructor() {
    this.loadRules();

    // Precompile regex once per rules change to avoid per-message RegExp allocations.
    effect(() => {
      // Track rulesSignal changes.
      const rules = this.rulesSignal();
      void rules;
      this.rebuildCompiledRegexes();
    });
  }

  private loadRules(): void {
    const stored = this.localStorageService.get<BlockedWordRule[]>(BLOCKED_WORDS_STORAGE_KEY, []);
    // Don't read channels signal during init to avoid change detection loops
    // Channel ref migration is handled lazily when rules are used
    const migrated = stored.map((rule) => ({
      ...rule,
      // Keep channelIds as-is, migrate lazily when needed
      channelIds: rule.channelIds,
    }));
    this.rulesSignal.set(migrated);
  }

  private migrateChannelRefs(rule: BlockedWordRule): BlockedWordRule {
    if (!rule.channelIds || rule.isGlobal) {
      return rule;
    }
    const channels = this.chatListService.getChannels();
    const migrated = migrateLegacyChannelRefs(rule.channelIds, channels);
    // Only update if refs actually changed
    if (JSON.stringify(migrated) !== JSON.stringify(rule.channelIds)) {
      const updatedRule = { ...rule, channelIds: migrated };
      this.updateRule(rule.id, { channelIds: migrated });
      return updatedRule;
    }
    return rule;
  }

  private persistRules(): void {
    this.localStorageService.set(BLOCKED_WORDS_STORAGE_KEY, this.rulesSignal());
  }

  private rebuildCompiledRegexes(): void {
    this.compiledRegexByRuleId.clear();

    for (const rule of this.rulesSignal()) {
      const pattern = rule.pattern?.trim() ?? "";
      if (!pattern) {
        this.compiledRegexByRuleId.set(rule.id, null);
        continue;
      }

      try {
        if (rule.isRegex) {
          this.compiledRegexByRuleId.set(rule.id, new RegExp(pattern, "gi"));
        } else {
          const escapedPattern = this.escapeRegExp(pattern);
          this.compiledRegexByRuleId.set(rule.id, new RegExp(escapedPattern, "gi"));
        }
      } catch {
        this.compiledRegexByRuleId.set(rule.id, null);
      }
    }
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
    this.rulesSignal.update((rules) => [...rules, newRule]);
    this.persistRules();
    return newRule;
  }

  /**
   * Update an existing rule
   */
  updateRule(ruleId: string, updates: Partial<BlockedWordRule>): void {
    this.rulesSignal.update((rules) =>
      rules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule))
    );
    this.persistRules();
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): void {
    this.rulesSignal.update((rules) => rules.filter((rule) => rule.id !== ruleId));
    this.persistRules();
  }

  /**
   * Toggle rule active state
   */
  toggleRule(ruleId: string): void {
    this.rulesSignal.update((rules) =>
      rules.map((rule) => (rule.id === ruleId ? { ...rule, isActive: !rule.isActive } : rule))
    );
    this.persistRules();
  }

  /**
   * Filter a message text, replacing blocked words
   * Returns the filtered text and whether any replacements were made
   */
  filterMessage(text: string, channelId: string): { filtered: string; wasFiltered: boolean } {
    const applicableRules = this.activeRules()
      .map((rule) => this.migrateChannelRefs(rule))
      .filter((rule) => rule.isGlobal || rule.channelIds?.includes(channelId));

    let filtered = text;
    let wasFiltered = false;

    for (const rule of applicableRules) {
      if (!rule.pattern.trim()) continue;

      const regex = this.compiledRegexByRuleId.get(rule.id);
      if (!regex) continue;

      try {
        regex.lastIndex = 0;
        const next = filtered.replace(regex, rule.replacement);
        if (next !== filtered) {
          wasFiltered = true;
          filtered = next;
        }
      } catch {
        // Compiled regex should be valid; ignore runtime replace errors.
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
    return this.activeRules()
      .map((rule) => this.migrateChannelRefs(rule))
      .filter((rule) => rule.isGlobal || rule.channelIds?.includes(channelId));
  }

  private generateId(): string {
    return `bw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
