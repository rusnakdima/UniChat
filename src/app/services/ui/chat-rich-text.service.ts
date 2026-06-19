import { Injectable, signal } from "@angular/core";

export interface ChatTextSegment {
  type: "text" | "emote" | "link" | "mention";
  text: string;
  url?: string;
  href?: string;
  value?: string;
  emote?: { id: string; urls: string[]; code?: string };
}

@Injectable({ providedIn: "root" })
export class ChatRichTextService {
  parse(text: string): ChatTextSegment[] {
    return [{ type: "text", text }];
  }
  buildSegments(text: string): ChatTextSegment[] {
    return this.parse(text);
  }
}
