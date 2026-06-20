import { Injectable, signal, computed, effect } from "@angular/core";
import { Theme } from "@entities/entities.theme.model";

@Injectable({ providedIn: "root" })
export class ThemeService {
  private _theme = signal<Theme>("dark");
  readonly themeMode = computed(() => this._theme());
  readonly theme = this._theme.asReadonly();

  constructor() {
    effect(() => {
      const theme = this._theme();
      if (typeof document !== "undefined") {
        document.body.classList.toggle("dark", theme === "dark");
      }
    });
  }

  getTheme(): Theme {
    return this._theme();
  }
  setTheme(theme: Theme): void {
    this._theme.set(theme);
  }
  toggleTheme(): void {
    this._theme.update((t) => (t === "dark" ? "light" : "dark"));
  }
  hydrateTheme(): void {
    // Restore theme from storage
  }
}
