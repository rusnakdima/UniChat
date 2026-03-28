/* sys lib */
import { Injectable, signal, computed } from "@angular/core";

export type SupportedLanguage = "en" | "es" | "de" | "fr" | "pt" | "ru";

export interface TranslationTree {
  [key: string]: string | TranslationTree;
}

/**
 * I18n Translation Service
 *
 * Provides internationalization support with:
 * - Multiple language support
 * - Nested translation keys
 * - Parameter interpolation
 * - Language persistence
 */
@Injectable({
  providedIn: "root",
})
export class I18nService {
  private readonly STORAGE_KEY = "unichat-language";

  // Available languages
  readonly supportedLanguages: Record<SupportedLanguage, string> = {
    en: "English",
    es: "Español",
    de: "Deutsch",
    fr: "Français",
    pt: "Português",
    ru: "Русский",
  };

  // Current language signal
  private readonly currentLangSignal = signal<SupportedLanguage>(this.loadLanguage());
  private readonly translationsSignal = signal<TranslationTree>({});

  // Public signals
  readonly currentLanguage = this.currentLangSignal.asReadonly();
  readonly currentLanguageName = computed(() => this.supportedLanguages[this.currentLangSignal()]);

  constructor() {
    this.loadTranslations(this.currentLangSignal());
  }

  /**
   * Load language from localStorage
   */
  private loadLanguage(): SupportedLanguage {
    const stored = localStorage.getItem(this.STORAGE_KEY) as SupportedLanguage | null;
    if (stored && this.supportedLanguages[stored]) {
      return stored;
    }

    // Detect browser language
    const browserLang = navigator.language.slice(0, 2) as SupportedLanguage;
    if (this.supportedLanguages[browserLang]) {
      return browserLang;
    }

    return "en";
  }

  /**
   * Save language to localStorage
   */
  private saveLanguage(lang: SupportedLanguage): void {
    localStorage.setItem(this.STORAGE_KEY, lang);
  }

  /**
   * Load translations for a language
   */
  private async loadTranslations(lang: SupportedLanguage): Promise<void> {
    try {
      const response = await fetch(`/assets/i18n/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load translations for ${lang}`);
      }
      const translations = await response.json();
      this.translationsSignal.set(translations);
    } catch (error) {
      console.error(`Error loading translations for ${lang}:`, error);
      // Fallback to English
      if (lang !== "en") {
        await this.loadTranslations("en");
      }
    }
  }

  /**
   * Change current language
   */
  async setLanguage(lang: SupportedLanguage): Promise<void> {
    if (!this.supportedLanguages[lang]) {
      console.warn(`Language ${lang} is not supported`);
      return;
    }

    this.currentLangSignal.set(lang);
    this.saveLanguage(lang);
    await this.loadTranslations(lang);
  }

  /**
   * Get translation by key
   * Supports nested keys with dot notation: 'APP.TITLE'
   * Supports parameter interpolation: 'Hello {{name}}'
   */
  translate(key: string, params?: Record<string, string | number>): string {
    const translations = this.translationsSignal();
    const keys = key.split(".");

    let value: string | TranslationTree = translations;
    for (const k of keys) {
      if (typeof value === "object" && k in value) {
        value = value[k];
      } else {
        // Key not found, return key as fallback
        return key;
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    // Interpolate parameters
    if (params) {
      return Object.entries(params).reduce(
        (result, [paramKey, paramValue]) =>
          result.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, "g"), String(paramValue)),
        value
      );
    }

    return value;
  }

  /**
   * Get all available languages
   */
  getAvailableLanguages(): { code: SupportedLanguage; name: string }[] {
    return Object.entries(this.supportedLanguages).map(([code, name]) => ({
      code: code as SupportedLanguage,
      name,
    }));
  }

  /**
   * Check if a language is available
   */
  isLanguageAvailable(lang: string): lang is SupportedLanguage {
    return lang in this.supportedLanguages;
  }
}

/**
 * Translation pipe alternative (for use in templates without Angular i18n pipe)
 * Usage: i18n.translate('APP.TITLE')
 */
export function t(key: string, params?: Record<string, string | number>): string {
  // This is a helper for non-template usage
  // For templates, use the I18nPipe
  const i18n = new I18nService();
  return i18n.translate(key, params);
}
