import { inject } from "@angular/core";
import { TwitchViewerCardService } from "@services/providers/twitch-viewer-card.service";
import { ChatMessage } from "@models/chat.model";

export class TwitchUserInfoService {
  private readonly viewerCard = inject(TwitchViewerCardService);

  async fetchUserProfileImage(username: string): Promise<string | null> {
    return this.viewerCard.fetchUserProfileImage(username);
  }

  async fetchUserInfo(username: string) {
    return this.viewerCard.fetchUserInfo(username);
  }

  async fetchTwitchViewerCard(channelLogin: string, targetLogin: string) {
    return this.viewerCard.fetchTwitchViewerCard(channelLogin, targetLogin);
  }

  async fetchChannelProfileImage(channelLogin: string): Promise<string | null> {
    return this.viewerCard.fetchChannelProfileImage(channelLogin);
  }
}
