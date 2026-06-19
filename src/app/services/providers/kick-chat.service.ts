import { Injectable } from "@angular/core";

export interface KickUserInfo {
  userId: string;
  username: string;
  avatarUrl: string;
  profile_pic_url?: string;
}

@Injectable({ providedIn: "root" })
export class KickChatService {
  connect(channel: string): void {}
  disconnect(): void {}
  sendMessage(text: string): void {}

  fetchUserInfo(userId: string): Promise<KickUserInfo> {
    return Promise.resolve({ userId, username: "", avatarUrl: "", profile_pic_url: "" });
  }
}
