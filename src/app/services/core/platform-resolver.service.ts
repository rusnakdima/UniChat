import { Injectable } from '@angular/core';

export interface PlatformStatus {
  platform: string;
  label: string;
  statusClasses: string;
  badgeClasses?: string;
  displayName?: string;
  mixedFilterBadgeClasses?: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformResolverService {
  private _platforms = new Map<string, PlatformStatus>();

  resolve(channelRef: string): string { return 'twitch'; }
  getPlatformName(platform: string): string { return platform; }
  getStatusLabel(platform: string): string { return platform; }
  getStatusClasses(platform: string): string { return ''; }
  getBadgeClasses(platform: string): string { return ''; }
  getChannelDisplayName(platform: string, channelId: string): string { return channelId; }
  getDisplayName(platform: string, channelId: string): string { return channelId; }
  getMixedFilterBadgeClasses(platform: string): string { return ''; }
}
