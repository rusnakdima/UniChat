/* sys lib */
import { Injectable } from "@angular/core";

/**
 * Interface for rules that require regex compilation
 */
export interface RegexRule {
  id: string;
  pattern: string | null | undefined;
  isRegex: boolean;
}

/**
 * Service for compiling and caching regular expressions
 * Used by blocked words and highlight rules services
 */
@Injectable({
  providedIn: "root",
})
export class RegexCompilationService {
  private compiledRegexes = new Map<string, RegExp | null>();

  /**
   * Compile a single pattern into a RegExp
   */
  compilePattern(pattern: string | null | undefined, isRegex: boolean): RegExp | null {
    const trimmedPattern = pattern?.trim() ?? "";

    if (!trimmedPattern) {
      return null;
    }

    try {
      if (isRegex) {
        return new RegExp(trimmedPattern, "gi");
      } else {
        const escapedPattern = this.escapeRegExp(trimmedPattern);
        return new RegExp(escapedPattern, "gi");
      }
    } catch {
      return null;
    }
  }

  /**
   * Compile multiple rules into a map of regexes
   */
  compileRules(rules: RegexRule[]): Map<string, RegExp | null> {
    const compiled = new Map<string, RegExp | null>();

    for (const rule of rules) {
      compiled.set(rule.id, this.compilePattern(rule.pattern, rule.isRegex));
    }

    return compiled;
  }

  /**
   * Rebuild compiled regexes for a set of rules
   * Updates the internal cache and returns the new map
   */
  rebuildRegexes(rules: RegexRule[]): Map<string, RegExp | null> {
    this.compiledRegexes.clear();
    this.compiledRegexes = this.compileRules(rules);
    return this.compiledRegexes;
  }

  /**
   * Get a compiled regex by rule ID
   */
  getRegex(ruleId: string): RegExp | null | undefined {
    return this.compiledRegexes.get(ruleId);
  }

  /**
   * Clear all cached regexes
   */
  clearCache(): void {
    this.compiledRegexes.clear();
  }

  /**
   * Get the number of cached regexes
   */
  getCacheSize(): number {
    return this.compiledRegexes.size;
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegExp(pattern: string): string {
    return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
