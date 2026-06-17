/* sys lib */
import { signal, computed, effect, inject } from "@angular/core";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";
import { ChatListService } from "@services/data/chat-list.service";
import { RegexCompilationService, RegexRule } from "@services/ui/regex-compilation.service";
import { migrateLegacyChannelRefs } from "@utils/channel-ref.util";
import { generateTimestamp } from "@shared/utils/chat.helper";

export interface Rule {
  id: string;
  pattern: string;
  isRegex: boolean;
  isGlobal: boolean;
  channelIds?: string[];
  isActive: boolean;
  createdAt: string;
}

export abstract class RuleBasedService<T extends Rule> {
  protected readonly localStorageService = inject(LocalStorageService);
  protected readonly chatListService = inject(ChatListService);
  protected readonly regexCompiler = inject(RegexCompilationService);

  protected readonly rulesSignal = signal<T[]>([]);
  protected readonly compiledRegexByRuleId = new Map<string, RegExp | null>();

  readonly rules = this.rulesSignal.asReadonly();

  readonly activeRules = computed(() => this.rulesSignal().filter((rule) => rule.isActive));

  readonly globalRules = computed(() => this.activeRules().filter((rule) => rule.isGlobal));

  constructor() {
    this.loadRules();

    effect(() => {
      const rules = this.rulesSignal();
      void rules;
      this.rebuildCompiledRegexes();
    });
  }

  protected abstract getStorageKey(): string;
  protected abstract getRuleName(): string;

  protected loadRules(): void {
    const stored = this.localStorageService.get<T[]>(this.getStorageKey(), []);
    const migrated = stored.map((rule) => ({
      ...rule,
      channelIds: rule.channelIds,
    }));
    this.rulesSignal.set(migrated);
  }

  protected migrateChannelRefs(rule: T): T {
    if (!rule.channelIds || rule.isGlobal) {
      return rule;
    }
    const channels = this.chatListService.getChannels();
    const migrated = migrateLegacyChannelRefs(rule.channelIds, channels) as string[] | undefined;
    if (JSON.stringify(migrated) !== JSON.stringify(rule.channelIds)) {
      const updatedRule = { ...rule, channelIds: migrated };
      this.updateRule(rule.id, { channelIds: migrated } as Partial<T>);
      return updatedRule;
    }
    return rule;
  }

  protected persistRules(): void {
    this.localStorageService.set(this.getStorageKey(), this.rulesSignal());
  }

  protected rebuildCompiledRegexes(): void {
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

  addRule(rule: Omit<T, "id" | "createdAt">): T {
    const newRule: T = {
      ...rule,
      id: this.generateId(),
      createdAt: generateTimestamp(),
    } as T;
    this.rulesSignal.update((rules) => [...rules, newRule]);
    this.persistRules();
    return newRule;
  }

  updateRule(ruleId: string, updates: Partial<T>): void {
    this.rulesSignal.update((rules) =>
      rules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule))
    );
    this.persistRules();
  }

  deleteRule(ruleId: string): void {
    this.rulesSignal.update((rules) => rules.filter((rule) => rule.id !== ruleId));
    this.persistRules();
  }

  toggleRule(ruleId: string): void {
    this.rulesSignal.update((rules) =>
      rules.map((rule) => (rule.id === ruleId ? { ...rule, isActive: !rule.isActive } : rule))
    );
    this.persistRules();
  }

  getRulesForChannel(channelId: string): T[] {
    return this.activeRules()
      .map((rule) => this.migrateChannelRefs(rule))
      .filter((rule) => rule.isGlobal || rule.channelIds?.includes(channelId));
  }

  protected generateId(): string {
    return `${this.getRuleName()}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
