/* sys lib */
import { Injectable, inject } from "@angular/core";

/* models */
import { ChatMessage, PlatformType } from "@models/chat.model";

export type OverlayEventType = "chatMessage" | "widgetConfig" | "channelUpdate" | "systemEvent";

export interface OverlayChatPayload {
  type: "chatMessage";
  message: {
    id: string;
    platform: PlatformType;
    author: string;
    text: string;
    timestamp: string;
    isSupporter: boolean;
    sourceChannelId: string;
    authorAvatarUrl?: string;
    channelImageUrl?: string;
  };
}

export interface OverlayWidgetConfigPayload {
  type: "widgetConfig";
  widgetId: string;
  filter: string;
  maxMessages: number;
  textSize: number;
  animationType: string;
  animationDirection: string;
  transparentBg: boolean;
  channelIds?: string[];
  timestamp: number;
}

export interface OverlayChannelUpdatePayload {
  type: "channelUpdate";
  action: "added" | "removed" | "updated";
  channelId: string;
  platform: PlatformType;
  channelName?: string;
  isAuthorized?: boolean;
  isVisible?: boolean;
}

export interface OverlaySystemEventPayload {
  type: "systemEvent";
  event: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export type OverlayEventPayload =
  | OverlayChatPayload
  | OverlayWidgetConfigPayload
  | OverlayChannelUpdatePayload
  | OverlaySystemEventPayload;

@Injectable({
  providedIn: "root",
})
export class OverlayEventService {
  private readonly bridge = inject(OverlaySourceBridgeService);

  sendChatMessage(message: ChatMessage): void {
    if (!message.canRenderInOverlay || message.text == null) {
      return;
    }
    this.bridge.forwardMessage(message);
  }

  sendWidgetConfig(config: Omit<OverlayWidgetConfigPayload, "type" | "timestamp">): void {
    const payload: OverlayWidgetConfigPayload = {
      type: "widgetConfig",
      ...config,
      timestamp: Date.now(),
    };
    this.bridge.sendEvent(payload);
  }

  sendChannelUpdate(update: Omit<OverlayChannelUpdatePayload, "type">): void {
    const payload: OverlayChannelUpdatePayload = {
      type: "channelUpdate",
      ...update,
    };
    this.bridge.sendEvent(payload);
  }

  sendSystemEvent(event: string, data?: Record<string, unknown>): void {
    const payload: OverlaySystemEventPayload = {
      type: "systemEvent",
      event,
      data,
      timestamp: Date.now(),
    };
    this.bridge.sendEvent(payload);
  }
}

/* Inline import to avoid circular dependency */
import { OverlaySourceBridgeService } from "@services/ui/overlay-source-bridge.service";
