import { Injectable } from "@angular/core";

export interface IconsEmoteIcon {
  id: string;
  url: string;
}

export interface IconsBadgeIcon {
  id: string;
  label: string;
  url: string;
}

export interface IconsPayload {
  emotes: Record<string, IconsEmoteIcon>; // key: emote code/name
  badges: Record<string, IconsBadgeIcon>; // key: `${badgeKey}/${badgeVersion}`
}

export interface IconsPayloadWithMeta extends IconsPayload {
  fetchedAtMs: number;
}

const GLOBAL_KEY = "unichat-icons-global";
function channelKey(roomId: string): string {
  return `unichat-icons-twitch-channel:${roomId}`;
}

@Injectable({
  providedIn: "root",
})
export class IconsStorageService {
  getGlobal(): IconsPayloadWithMeta | null {
    const raw = localStorage.getItem(GLOBAL_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as IconsPayloadWithMeta;
    } catch {
      return null;
    }
  }

  setGlobal(payload: IconsPayloadWithMeta): void {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(payload));
  }

  getChannel(roomId: string): IconsPayloadWithMeta | null {
    const raw = localStorage.getItem(channelKey(roomId));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as IconsPayloadWithMeta;
    } catch {
      return null;
    }
  }

  setChannel(roomId: string, payload: IconsPayloadWithMeta): void {
    localStorage.setItem(channelKey(roomId), JSON.stringify(payload));
  }
}
