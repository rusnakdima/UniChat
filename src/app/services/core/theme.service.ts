import { DOCUMENT } from "@angular/common";
import { Injectable, inject, signal } from "@angular/core";
import { ThemeMode } from "@models/chat.model";

const storageKey = "unichat-theme";

@Injectable({
  providedIn: "root",
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  private readonly themeSignal = signal<ThemeMode>("light");
  private followsSystem = true;
  private isHydrated = false;

  readonly themeMode = this.themeSignal.asReadonly();

  constructor() {
    this.mediaQuery.addEventListener("change", (event) => {
      if (this.followsSystem) {
        this.applyTheme(event.matches ? "dark" : "light");
      }
    });
  }

  hydrateTheme(): void {
    if (this.isHydrated) {
      return;
    }

    const storedTheme = this.readStoredTheme();

    this.followsSystem = !storedTheme;
    this.applyTheme(storedTheme ?? this.getSystemTheme());
    this.isHydrated = true;
  }

  toggleTheme(): void {
    const nextTheme = this.themeSignal() === "dark" ? "light" : "dark";

    this.followsSystem = false;
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
