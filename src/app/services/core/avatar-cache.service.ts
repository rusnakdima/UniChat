import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class AvatarCacheService {
  private _cache = new Map<string, string>();

  getAvatarUrl(userId: string): string | null {
    return this._cache.get(userId) || null;
  }
  getUserAvatar(userId: string): string | null {
    return this.getAvatarUrl(userId);
  }
  setUserAvatar(userId: string, avatarUrl: string): void {
    this._cache.set(userId, avatarUrl);
  }
  setChannelAvatar(channelId: string, avatarUrl: string): void {
    this._cache.set(channelId, avatarUrl);
  }
  hasUserAvatar(userId: string): boolean {
    return this._cache.has(userId);
  }
  preloadAvatars(userIds: string[]): void {
    userIds.forEach((id) => {
      if (!this._cache.has(id)) this._cache.set(id, `https://avatar.example.com/${id}`);
    });
  }
  clearCache(): void {
    this._cache.clear();
  }
}
