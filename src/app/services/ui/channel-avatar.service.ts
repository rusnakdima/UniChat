import { Injectable, signal } from "@angular/core";

export interface ChannelAvatar {
  channelId: string;
  imageUrl: string;
  initial?: string;
}

@Injectable({ providedIn: "root" })
export class ChannelAvatarService {
  private _avatars = new Map<string, string>();

  getAvatarUrl(channelRef: string): string | null {
    return this._avatars.get(channelRef) || null;
  }

  getChannelImageForChannel(channelRef: string): string | null {
    return this.getAvatarUrl(channelRef);
  }

  getChannelInitial(channelRef: string): string {
    return channelRef.charAt(0).toUpperCase();
  }

  ensureChannelImage(channelRef: string): string | null {
    if (!this._avatars.has(channelRef)) {
      this._avatars.set(channelRef, `https://avatar.example.com/${channelRef}`);
    }
    return this.getAvatarUrl(channelRef);
  }

  ensureChannelImageForChannel(channelRef: string): string | null {
    return this.ensureChannelImage(channelRef);
  }

  preloadAvatars(channelRefs: string[]): void {
    channelRefs.forEach((ref) => {
      if (!this._avatars.has(ref)) {
        this._avatars.set(ref, `https://avatar.example.com/${ref}`);
      }
    });
  }

  setChannelAvatar(channelRef: string, avatarUrl: string): void {
    this._avatars.set(channelRef, avatarUrl);
  }
}
