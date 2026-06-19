import { Injectable } from "@angular/core";

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

  platformLabel(message: unknown): string {
    return "";
  }
  platformIconUrl(message: unknown): string {
    return "";
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
