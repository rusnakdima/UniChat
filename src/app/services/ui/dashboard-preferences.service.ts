import { Injectable, signal, Signal } from "@angular/core";

const STORAGE_KEY = "unichat-dashboard-preferences";

export interface DashboardPreferences {
  theme: string;
  fontSize: number;
  mixedEnabledChannelIds: Set<string>;
  autoScroll: boolean;
  feedMode: string;
  densityMode: string;
  splitLayout: unknown;
}

function loadFromStorage(): DashboardPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        theme: parsed.theme ?? "dark",
        fontSize: parsed.fontSize ?? 14,
        mixedEnabledChannelIds: new Set<string>(parsed.mixedEnabledChannelIds ?? []),
        autoScroll: parsed.autoScroll ?? true,
        feedMode: parsed.feedMode ?? "mixed",
        densityMode: parsed.densityMode ?? "comfortable",
        splitLayout: parsed.splitLayout ?? {},
      };
    }
  } catch {
    // ignore
  }
  return {
    theme: "dark",
    fontSize: 14,
    mixedEnabledChannelIds: new Set(),
    autoScroll: true,
    feedMode: "mixed",
    densityMode: "comfortable",
    splitLayout: {},
  };
}

function saveToStorage(prefs: DashboardPreferences): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...prefs,
        mixedEnabledChannelIds: Array.from(prefs.mixedEnabledChannelIds),
      })
    );
  } catch {
    // ignore
  }
}

@Injectable({ providedIn: "root" })
export class DashboardPreferencesService {
  private _prefs = signal<DashboardPreferences>(loadFromStorage());

  readonly preferences: Signal<DashboardPreferences> = this._prefs.asReadonly();

  getPreferences(): DashboardPreferences {
    return this._prefs();
  }
  savePreferences(prefs: DashboardPreferences): void {
    this._prefs.set(prefs);
    saveToStorage(prefs);
  }
  addMixedEnabledChannelId(channelId: string): void {
    this._prefs.update((p) => {
      const s = new Set(p.mixedEnabledChannelIds);
      s.add(channelId);
      const next = { ...p, mixedEnabledChannelIds: s };
      saveToStorage(next);
      return next;
    });
  }
  removeMixedEnabledChannelId(channelId: string): void {
    this._prefs.update((p) => {
      const s = new Set(p.mixedEnabledChannelIds);
      s.delete(channelId);
      const next = { ...p, mixedEnabledChannelIds: s };
      saveToStorage(next);
      return next;
    });
  }
  setMixedEnabledChannelIds(channelIds: string[]): void {
    this._prefs.update((p) => {
      const next = { ...p, mixedEnabledChannelIds: new Set(channelIds) };
      saveToStorage(next);
      return next;
    });
  }
  setAutoScroll(enabled: boolean): void {
    this._prefs.update((p) => {
      const next = { ...p, autoScroll: enabled };
      saveToStorage(next);
      return next;
    });
  }
  cleanMixedEnabledChannelIds(validRefs: Set<string>): void {
    this._prefs.update((p) => {
      const validLower = new Set(Array.from(validRefs).map((r) => r.toLowerCase()));
      const cleaned = new Set(
        Array.from(p.mixedEnabledChannelIds).filter((ref) => validLower.has(ref.toLowerCase()))
      );
      if (cleaned.size !== p.mixedEnabledChannelIds.size) {
        const next = { ...p, mixedEnabledChannelIds: cleaned };
        saveToStorage(next);
        return next;
      }
      return p;
    });
  }
}
