import { Injectable } from "@angular/core";

const OVERLAY_PREFIX = "unichat_overlay_";

interface OverlayConfig {
  filter?: string;
  customCss?: string;
  channelIds?: string[] | null;
  textSize?: number;
  animationType?: string;
  animationDirection?: string;
  maxMessages?: number;
  transparentBg?: boolean;
}

@Injectable({ providedIn: "root" })
export class OverlayStorageService {
  private getKey(overlayId: string, field: string): string {
    return `${OVERLAY_PREFIX}${overlayId}:${field}`;
  }

  getOverlayConfig(overlayId: string): unknown {
    const config: OverlayConfig = {
      filter: this.readOverlayFilterOverride(overlayId) ?? undefined,
      customCss: this.readOverlayCustomCss(overlayId) || undefined,
      channelIds: this.readOverlayChannelIds(overlayId) || null,
      textSize: this.readOverlayTextSize(overlayId),
      animationType: this.readOverlayAnimationType(overlayId),
      animationDirection: this.readOverlayAnimationDirection(overlayId),
      maxMessages: this.readOverlayMaxMessages(overlayId),
      transparentBg: this.readOverlayTransparentBg(overlayId),
    };
    return config;
  }

  saveOverlayConfig(overlayId: string, config: OverlayConfig): void {
    if (config.filter !== undefined) {
      localStorage.setItem(this.getKey(overlayId, "filter_override"), config.filter);
    }
    if (config.customCss !== undefined) {
      localStorage.setItem(this.getKey(overlayId, "custom_css"), config.customCss);
    }
    if (config.channelIds !== undefined) {
      localStorage.setItem(
        this.getKey(overlayId, "channel_ids"),
        JSON.stringify(config.channelIds)
      );
    }
    if (config.textSize !== undefined) {
      localStorage.setItem(this.getKey(overlayId, "text_size"), String(config.textSize));
    }
    if (config.animationType !== undefined) {
      localStorage.setItem(this.getKey(overlayId, "animation_type"), config.animationType);
    }
    if (config.animationDirection !== undefined) {
      localStorage.setItem(
        this.getKey(overlayId, "animation_direction"),
        config.animationDirection
      );
    }
    if (config.maxMessages !== undefined) {
      localStorage.setItem(this.getKey(overlayId, "max_messages"), String(config.maxMessages));
    }
    if (config.transparentBg !== undefined) {
      localStorage.setItem(this.getKey(overlayId, "transparent_bg"), String(config.transparentBg));
    }
  }

  readOverlayFilterOverride(overlayId: string): string | null {
    return localStorage.getItem(this.getKey(overlayId, "filter_override"));
  }

  readOverlayChannelIds(overlayId: string, fallback?: string[]): string[] {
    const stored = localStorage.getItem(this.getKey(overlayId, "channel_ids"));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : fallback || [];
      } catch {
        return fallback || [];
      }
    }
    return fallback || [];
  }

  readOverlayTransparentBg(overlayId: string): boolean {
    const stored = localStorage.getItem(this.getKey(overlayId, "transparent_bg"));
    return stored === "true";
  }

  readOverlayTextSize(overlayId: string): number {
    const stored = localStorage.getItem(this.getKey(overlayId, "text_size"));
    return stored ? parseInt(stored, 10) : 14;
  }

  readOverlayMaxMessages(overlayId: string): number {
    const stored = localStorage.getItem(this.getKey(overlayId, "max_messages"));
    return stored ? parseInt(stored, 10) : 100;
  }

  readOverlayAnimationType(overlayId: string): string {
    return localStorage.getItem(this.getKey(overlayId, "animation_type")) || "fade";
  }

  readOverlayAnimationDirection(overlayId: string): string {
    return localStorage.getItem(this.getKey(overlayId, "animation_direction")) || "up";
  }

  readOverlayCustomCss(overlayId: string): string {
    return localStorage.getItem(this.getKey(overlayId, "custom_css")) || "";
  }
}

@Injectable({ providedIn: "root" })
export class OverlayStorageServiceImpl extends OverlayStorageService {}
