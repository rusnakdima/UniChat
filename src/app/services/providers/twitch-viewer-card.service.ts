import { Injectable } from "@angular/core";

export interface TwitchViewerInfo {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  profile_pic_url?: string;
  badges: string[];
}

@Injectable({ providedIn: "root" })
export class TwitchViewerCardService {
  getViewerCard(userId: string): Promise<TwitchViewerInfo> {
    return Promise.resolve({ userId, username: "", avatarUrl: "", badges: [], id: userId });
  }

  fetchUserInfo(userId: string): Promise<TwitchViewerInfo> {
    return this.getViewerCard(userId);
  }
  fetchTwitchViewerCard(userId: string): Promise<TwitchViewerInfo> {
    return this.getViewerCard(userId);
  }
  fetchChannelProfileImage(channelId: string): Promise<string> {
    return Promise.resolve("");
  }
}
