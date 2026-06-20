import { Injectable } from "@angular/core";
import { PlatformType } from "@entities/chat.model";
import {
  PLATFORM_TWITCH_ICON,
  PLATFORM_KICK_ICON,
  PLATFORM_YOUTUBE_ICON,
} from "@shared/utils/constants";

export interface ChatMessagePresentation {
  messageId: string;
  formattedText: string;
  platformLabel: string;
  platformIconUrl: string;
  usernameColorClasses: string[];
  messageBadgeClasses: string[];
}

@Injectable({ providedIn: "root" })
export class ChatMessagePresentationService {
  present(message: unknown): ChatMessagePresentation {
    return {
      messageId: "",
      formattedText: "",
      platformLabel: "",
      platformIconUrl: "",
      usernameColorClasses: [],
      messageBadgeClasses: [],
    };
  }

  platformLabel(platform: PlatformType): string {
    const labels: Record<PlatformType, string> = {
      twitch: "Twitch",
      kick: "Kick",
      youtube: "YouTube",
    };
    return labels[platform] ?? "";
  }

  platformIconUrl(platform: PlatformType): string {
    const icons: Record<PlatformType, string> = {
      twitch: PLATFORM_TWITCH_ICON,
      kick: PLATFORM_KICK_ICON,
      youtube: PLATFORM_YOUTUBE_ICON,
    };
    return icons[platform] ?? "";
  }
  usernameColorClasses(message: unknown): string[] {
    return [];
  }
  messageBadgeClasses(message: unknown): string[] {
    return [];
  }
  messageTimeLabel(message: unknown): string {
    return "";
  }
  messageFullTimeLabel(message: unknown): string {
    return "";
  }
  replyParentSnippet(message: unknown): string {
    return "";
  }
  getHighlightColor(message: unknown): string {
    return "";
  }
}
