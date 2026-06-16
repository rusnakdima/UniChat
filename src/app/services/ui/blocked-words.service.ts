/* sys lib */
import { Injectable } from "@angular/core";

/* services */
import { RuleBasedService, Rule } from "@services/ui/rule-based.service";

const BLOCKED_WORDS_STORAGE_KEY = "unichat.blockedWords.v1";

export interface BlockedWordRule extends Rule {
  replacement: string;
}

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
export class BlockedWordsService extends RuleBasedService<BlockedWordRule> {
  protected getStorageKey(): string {
    return BLOCKED_WORDS_STORAGE_KEY;
  }

  protected getRuleName(): string {
    return "bw";
  }

  private escapeRegExp(pattern: string): string {
    return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
}
