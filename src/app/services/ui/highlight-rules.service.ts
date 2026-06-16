/* sys lib */
import { Injectable } from "@angular/core";

/* services */
import { RuleBasedService, Rule } from "@services/ui/rule-based.service";

const HIGHLIGHT_RULES_STORAGE_KEY = "unichat.highlightRules.v1";

export interface HighlightRule extends Rule {
  color: string;
}

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
export class HighlightRulesService extends RuleBasedService<HighlightRule> {
  protected getStorageKey(): string {
    return HIGHLIGHT_RULES_STORAGE_KEY;
  }

  protected getRuleName(): string {
    return "hl";
  }

  /**
   * Check if a message should be highlighted and return the highlight color
   * Returns null if no highlight matches
   */
  getHighlightColor(text: string, author: string, channelId: string): string | null {
    const applicableRules = this.activeRules()
      .map((rule) => this.migrateChannelRefs(rule))
      .filter((rule) => rule.isGlobal || rule.channelIds?.includes(channelId));

    const lowerText = text.toLowerCase();
    const lowerAuthor = author.toLowerCase();

    for (const rule of applicableRules) {
      if (!rule.pattern.trim()) {
        continue;
      }

      try {
        if (rule.isRegex) {
          const regex = this.compiledRegexByRuleId.get(rule.id);
          if (regex && (regex.test(text) || regex.test(author))) {
            return rule.color;
          }
        } else {
          // Simple string matching (case-insensitive)
          const lowerPattern = rule.pattern.toLowerCase();
          if (lowerText.includes(lowerPattern) || lowerAuthor.includes(lowerPattern)) {
            return rule.color;
          }
        }
      } catch {
        /* invalid regex for rule — skip */
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
}
