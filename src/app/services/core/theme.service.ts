import { Injectable } from '@angular/core';
import { Theme } from '@app/models';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _theme = signal<Theme>('dark');
  readonly themeMode = computed(() => this._theme());
  readonly theme = this._theme.asReadonly();

  getTheme(): Theme { return this._theme(); }
  setTheme(theme: Theme): void { this._theme.set(theme); }
  toggleTheme(): void {
    this._theme.update(t => t === 'dark' ? 'light' : 'dark');
  }
  hydrateTheme(): void {
    // Restore theme from storage
  }
}

function computed<T>(fn: () => T): import('@angular/core').Signal<T> {
  return signal(fn()) as import('@angular/core').Signal<T>;
}
