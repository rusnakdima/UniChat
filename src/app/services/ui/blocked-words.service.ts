/* sys lib */
import { Injectable, signal, computed, inject, effect } from "@angular/core";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { migrateLegacyChannelRefs } from "@utils/channel-ref.util";
import { RegexCompilationService, RegexRule } from "@services/ui/regex-compilation.service";
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
  private readonly regexCompiler = inject(RegexCompilationService);

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
    const rules: RegexRule[] = this.rulesSignal().map((rule) => ({
      id: rule.id,
      pattern: rule.pattern,
      isRegex: rule.isRegex,
    }));
    this.compiledRegexByRuleId.clear();
    const compiled = this.regexCompiler.compileRules(rules);
    for (const [id, regex] of compiled.entries()) {
      this.compiledRegexByRuleId.set(id, regex);
    }
  }

  private escapeRegExp(pattern: string): string {
    return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
   * Uses combined regex for O(1) pattern matching instead of O(n)
   * Returns the filtered text and whether any replacements were made
   */
  filterMessage(text: string, channelId: string): { filtered: string; wasFiltered: boolean } {
    const applicableRules = this.activeRules()
      .map((rule) => this.migrateChannelRefs(rule))
      .filter((rule) => rule.isGlobal || rule.channelIds?.includes(channelId));

    if (applicableRules.length === 0) {
      return { filtered: text, wasFiltered: false };
    }

    // Build combined regex pattern for single-pass matching
    const ruleMap = new Map<string, BlockedWordRule>();
    const patterns: string[] = [];

    for (const rule of applicableRules) {
      if (!rule.pattern?.trim()) continue;

      const pattern = rule.isRegex ? rule.pattern : this.escapeRegExp(rule.pattern);
      if (pattern) {
        patterns.push(`(${pattern})`);
        ruleMap.set(pattern, rule);
      }
    }

    if (patterns.length === 0) {
      return { filtered: text, wasFiltered: false };
    }

    // Single combined regex for all patterns
    const combinedRegex = new RegExp(patterns.join("|"), "gi");
    let wasFiltered = false;

    const filtered = text.replace(combinedRegex, (match) => {
      // Find which rule matched this pattern
      for (const [pattern, rule] of ruleMap.entries()) {
        const testRegex = new RegExp(`^${pattern}$`, "i");
        if (testRegex.test(match)) {
          wasFiltered = true;
          return rule.replacement;
        }
      }
      return match;
    });

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
}
