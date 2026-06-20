import { Injectable, inject } from "@angular/core";
import { TwitchChatService } from "./twitch-chat.service";
import { KickChatService } from "./kick-chat.service";
import { YouTubeChatService } from "./youtube-chat.service";

@Injectable({ providedIn: "root" })
export class ChatProviderCoordinatorService {
  private readonly twitch = inject(TwitchChatService);
  private readonly kick = inject(KickChatService);
  private readonly youtube = inject(YouTubeChatService);

  private _activeProviders = new Set<string>();

  get activeProviders(): string[] {
    return Array.from(this._activeProviders);
  }

  registerProvider(name: string): void {
    this._activeProviders.add(name);
  }

  unregisterProvider(name: string): void {
    this._activeProviders.delete(name);
  }

  connectChannel(channelId: string, platform: string): void {
    switch (platform) {
      case "twitch":
        this.twitch
          .connect(channelId)
          .catch((e) =>
            console.error(`[ProviderCoordinator] Failed to connect Twitch ${channelId}:`, e)
          );
        break;
      case "kick":
        this.kick
          .connect(channelId)
          .catch((e) =>
            console.error(`[ProviderCoordinator] Failed to connect Kick ${channelId}:`, e)
          );
        break;
      case "youtube":
        this.youtube
          .connect(channelId)
          .catch((e) =>
            console.error(`[ProviderCoordinator] Failed to connect YouTube ${channelId}:`, e)
          );
        break;
    }
  }
}
