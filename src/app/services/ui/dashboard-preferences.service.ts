export interface PlatformAccount {
  id: string;
  platform: string;
  username: string;
  userId: string;
  avatarUrl: string;
  isConnected: boolean;
  authStatus: string;
  accessToken: string;
  authorizedAt: string;
}

export interface DashboardPreferences {
  theme: string;
  fontSize: number;
  mixedEnabledChannelIds: Set<string>;
  autoScroll: boolean;
  feedMode: string;
  densityMode: string;
  splitLayout: Record<string, unknown>;
}

export class DashboardPreferencesService {
  cleanMixedEnabledChannelIds(validRefs: Set<string>): void {}
  addMixedEnabledChannelId(ref: string): void {}
  removeMixedEnabledChannelId(ref: string): void {}
  setMixedEnabledChannelIds(ids: Set<string>): void {}
  getPreferences(): DashboardPreferences {
    return {
      theme: 'dark',
      fontSize: 14,
      mixedEnabledChannelIds: new Set(),
      autoScroll: true,
      feedMode: 'mixed',
      densityMode: 'comfortable',
      splitLayout: {},
    };
  }
  savePreferences(): void {}
}
