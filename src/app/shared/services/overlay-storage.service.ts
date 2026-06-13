import { Injectable } from "@angular/core";
import { OverlayAnimationType, OverlayDirection, WidgetFilter } from "@models/chat.model";
import {
  overlayFilterOverrideKey,
  overlayCustomCssKey,
  overlayChannelIdsKey,
  overlayMaxMessagesKey,
  overlayTextSizeKey,
  overlayAnimationTypeKey,
  overlayAnimationDirectionKey,
  overlayTransparentBgKey,
} from "@constants/overlay-storage.constants";

export interface OverlayConfig {
  filter: WidgetFilter;
  customCss: string;
  channelIds: string[] | null;
  textSize: number;
  animationType: OverlayAnimationType;
  animationDirection: OverlayDirection;
  maxMessages: number;
  transparentBg: boolean;
}

@Injectable({ providedIn: "root" })
export class OverlayStorageService {
  private readonly PREFIX = "overlay_";

  readOverlayFilterOverride(widgetId: string): WidgetFilter | null {
    const raw = localStorage.getItem(overlayFilterOverrideKey(widgetId));
    if (raw === "all" || raw === "supporters") {
      return raw;
    }
    return null;
  }

  readOverlayCustomCss(widgetId: string): string {
    return localStorage.getItem(overlayCustomCssKey(widgetId)) ?? "";
  }

  readOverlayChannelIds(widgetId: string): string[] | null {
    const raw = localStorage.getItem(overlayChannelIdsKey(widgetId));
    if (raw) {
      try {
        return JSON.parse(raw) as string[];
      } catch {
        return null;
      }
    }
    return null;
  }

  readOverlayMaxMessages(widgetId: string): number | null {
    const raw = localStorage.getItem(overlayMaxMessagesKey(widgetId));
    if (raw) {
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  readOverlayTextSize(widgetId: string): number | null {
    const raw = localStorage.getItem(overlayTextSizeKey(widgetId));
    if (raw) {
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  readOverlayAnimationType(widgetId: string): OverlayAnimationType | null {
    const raw = localStorage.getItem(overlayAnimationTypeKey(widgetId));
    if (raw === "none" || raw === "fade" || raw === "slide" || raw === "pop") {
      return raw;
    }
    return null;
  }

  readOverlayAnimationDirection(widgetId: string): OverlayDirection | null {
    const raw = localStorage.getItem(overlayAnimationDirectionKey(widgetId));
    if (raw === "top" || raw === "bottom" || raw === "left" || raw === "right") {
      return raw;
    }
    return null;
  }

  readOverlayTransparentBg(widgetId: string): boolean | null {
    const raw = localStorage.getItem(overlayTransparentBgKey(widgetId));
    if (raw === "true" || raw === "false") {
      return raw === "true";
    }
    return null;
  }

  saveOverlayConfig(widgetId: string, config: OverlayConfig): void {
    localStorage.setItem(overlayFilterOverrideKey(widgetId), config.filter);
    localStorage.setItem(overlayCustomCssKey(widgetId), config.customCss);
    if (config.channelIds === null) {
      localStorage.removeItem(overlayChannelIdsKey(widgetId));
    } else {
      localStorage.setItem(overlayChannelIdsKey(widgetId), JSON.stringify(config.channelIds));
    }
    localStorage.setItem(overlayMaxMessagesKey(widgetId), config.maxMessages.toString());
    localStorage.setItem(overlayTextSizeKey(widgetId), config.textSize.toString());
    localStorage.setItem(overlayAnimationTypeKey(widgetId), config.animationType);
    localStorage.setItem(overlayAnimationDirectionKey(widgetId), config.animationDirection);
    localStorage.setItem(overlayTransparentBgKey(widgetId), config.transparentBg.toString());
  }
}
