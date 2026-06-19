import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class OverlayStorageService {
  getOverlayConfig(overlayId: string): unknown { return null; }
  saveOverlayConfig(overlayId: string, config: unknown): void {}
  readOverlayFilterOverride(overlayId: string): string | null { return null; }
  readOverlayChannelIds(overlayId: string, fallback?: string[]): string[] { return fallback || []; }
  readOverlayTransparentBg(overlayId: string): boolean { return false; }
  readOverlayTextSize(overlayId: string): number { return 14; }
  readOverlayMaxMessages(overlayId: string): number { return 100; }
  readOverlayAnimationType(overlayId: string): string { return 'fade'; }
  readOverlayAnimationDirection(overlayId: string): string { return 'up'; }
  readOverlayCustomCss(overlayId: string): string { return ''; }
}

@Injectable({ providedIn: 'root' })
export class OverlayStorageServiceImpl {
  getOverlayConfig(overlayId: string): unknown { return null; }
  saveOverlayConfig(overlayId: string, config: unknown): void {}
  readOverlayFilterOverride(overlayId: string): string | null { return null; }
  readOverlayChannelIds(overlayId: string, fallback?: string[]): string[] { return fallback || []; }
  readOverlayTransparentBg(overlayId: string): boolean { return false; }
  readOverlayTextSize(overlayId: string): number { return 14; }
  readOverlayMaxMessages(overlayId: string): number { return 100; }
  readOverlayAnimationType(overlayId: string): string { return 'fade'; }
  readOverlayAnimationDirection(overlayId: string): string { return 'up'; }
  readOverlayCustomCss(overlayId: string): string { return ''; }
}
