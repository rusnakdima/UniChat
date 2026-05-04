/* sys lib */
import { DOCUMENT } from "@angular/common";
import { Injectable, inject, signal, OnDestroy } from "@angular/core";

/* models */
import { ThemeMode } from "@models/chat.model";
const storageKey = "unichat-theme";

@Injectable({
  providedIn: "root",
})
export class ThemeService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  private readonly themeSignal = signal<ThemeMode>("light");

  readonly themeMode = this.themeSignal.asReadonly();

  private readonly mediaQueryHandler = (event: MediaQueryListEvent) => {
    const storedTheme = localStorage.getItem(storageKey);
    if (!storedTheme || storedTheme === "system") {
      this.applyTheme(event.matches ? "dark" : "light");
    }
  };

  constructor() {
    this.mediaQuery.addEventListener("change", this.mediaQueryHandler);
  }

  ngOnDestroy(): void {
    this.mediaQuery.removeEventListener("change", this.mediaQueryHandler);
  }

  hydrateTheme(): void {
    const storedTheme = this.readStoredTheme();
    this.applyTheme(storedTheme ?? this.getSystemTheme());
  }

  toggleTheme(): void {
    const nextTheme = this.themeSignal() === "dark" ? "light" : "dark";
    this.persistTheme(nextTheme);
    this.applyTheme(nextTheme);
  }

  private readStoredTheme(): ThemeMode | null {
    const storedValue = localStorage.getItem(storageKey);

    if (storedValue === "light" || storedValue === "dark") {
      return storedValue;
    }

    return null;
  }

  private persistTheme(theme: ThemeMode): void {
    localStorage.setItem(storageKey, theme);
  }

  private getSystemTheme(): ThemeMode {
    return this.mediaQuery.matches ? "dark" : "light";
  }

  private applyTheme(theme: ThemeMode): void {
    const root = this.document.documentElement;

    this.themeSignal.set(theme);
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }
}
