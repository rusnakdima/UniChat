import { Injectable, signal } from '@angular/core';

export interface DashboardPreferences {
  theme: string;
  fontSize: number;
  mixedEnabledChannelIds: Set<string>;
}

@Injectable({ providedIn: 'root' })
export class DashboardPreferencesService {
  private _prefs = signal<DashboardPreferences>({
    theme: 'dark', fontSize: 14, mixedEnabledChannelIds: new Set()
  });

  getPreferences(): DashboardPreferences { return this._prefs(); }
  savePreferences(prefs: DashboardPreferences): void { this._prefs.set(prefs); }
  addMixedEnabledChannelId(channelId: string): void {
    this._prefs.update(p => { const s = new Set(p.mixedEnabledChannelIds); s.add(channelId); return { ...p, mixedEnabledChannelIds: s }; });
  }
  removeMixedEnabledChannelId(channelId: string): void {
    this._prefs.update(p => { const s = new Set(p.mixedEnabledChannelIds); s.delete(channelId); return { ...p, mixedEnabledChannelIds: s }; });
  }
  setMixedEnabledChannelIds(channelIds: string[]): void {
    this._prefs.update(p => ({ ...p, mixedEnabledChannelIds: new Set(channelIds) }));
  }
  setAutoScroll(enabled: boolean): void {}
}
