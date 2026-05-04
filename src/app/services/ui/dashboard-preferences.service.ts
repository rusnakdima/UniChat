/* sys lib */
import { Injectable, inject, signal, OnDestroy } from "@angular/core";

/* models */
import { DashboardPreferences, DensityMode, FeedMode, PlatformType } from "@models/chat.model";

/* services */
import { LoggerService } from "@services/core/logger.service";
import { LocalStorageService } from "@services/core/local-storage.service";
const storageKey = "unichat-dashboard-preferences";

const defaultPreferences: DashboardPreferences = {
  feedMode: "mixed",
  densityMode: "comfortable",
  mixedEnabledChannelIds: [],
  splitLayout: {
    orderedPlatforms: ["twitch", "kick", "youtube"],
    hiddenPlatforms: [],
    columnWidths: {
      twitch: 320,
      kick: 320,
      youtube: 320,
    },
    orderedChannelIds: {},
    orientation: "row",
    splitEnabledChannelIds: {},
  },
};

@Injectable({
  providedIn: "root",
})
export class DashboardPreferencesService implements OnDestroy {
  private readonly localStorage = inject(LocalStorageService);
  private readonly logger = inject(LoggerService);
  private readonly preferencesSignal = signal<DashboardPreferences>(this.readPreferences());
  private readonly storageHandler = (ev: StorageEvent) => {
    if (ev.key !== storageKey) {
      return;
    }
    this.preferencesSignal.set(this.readPreferences());
  };

  readonly preferences = this.preferencesSignal.asReadonly();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.storageHandler);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", this.storageHandler);
    }
  }

  setFeedMode(feedMode: FeedMode): void {
    this.updatePreferences({
      ...this.preferencesSignal(),
      feedMode,
    });
  }

  setDensityMode(densityMode: DensityMode): void {
    this.updatePreferences({
      ...this.preferencesSignal(),
      densityMode,
    });
  }

  movePlatform(platform: PlatformType, direction: "left" | "right"): void {
    const preferences = this.preferencesSignal();
    const orderedPlatforms = [...preferences.splitLayout.orderedPlatforms];
    const currentIndex = orderedPlatforms.indexOf(platform);

    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;

    if (nextIndex < 0 || nextIndex >= orderedPlatforms.length) {
      return;
    }

    [orderedPlatforms[currentIndex], orderedPlatforms[nextIndex]] = [
      orderedPlatforms[nextIndex],
      orderedPlatforms[currentIndex],
    ];

    this.updatePreferences({
      ...preferences,
      splitLayout: {
        ...preferences.splitLayout,
        orderedPlatforms,
      },
    });
  }

  togglePlatformVisibility(platform: PlatformType): void {
    const preferences = this.preferencesSignal();
    const hiddenPlatforms = new Set(preferences.splitLayout.hiddenPlatforms);

    if (hiddenPlatforms.has(platform)) {
      hiddenPlatforms.delete(platform);
    } else {
      hiddenPlatforms.add(platform);
    }

    this.updatePreferences({
      ...preferences,
      splitLayout: {
        ...preferences.splitLayout,
        hiddenPlatforms: [...hiddenPlatforms],
      },
    });
  }

  setColumnWidth(platform: PlatformType, width: number): void {
    const preferences = this.preferencesSignal();
    const clampedWidth = Math.min(Math.max(width, 280), 800);

    this.updatePreferences({
      ...preferences,
      splitLayout: {
        ...preferences.splitLayout,
        columnWidths: {
          ...preferences.splitLayout.columnWidths,
          [platform]: clampedWidth,
        },
      },
    });
  }

  reorderPlatforms(fromIndex: number, toIndex: number): void {
    const preferences = this.preferencesSignal();
    const orderedPlatforms = [...preferences.splitLayout.orderedPlatforms];

    if (fromIndex < 0 || fromIndex >= orderedPlatforms.length) {
      return;
    }

    if (toIndex < 0 || toIndex >= orderedPlatforms.length) {
      return;
    }

    const [removed] = orderedPlatforms.splice(fromIndex, 1);
    orderedPlatforms.splice(toIndex, 0, removed);

    this.updatePreferences({
      ...preferences,
      splitLayout: {
        ...preferences.splitLayout,
        orderedPlatforms,
      },
    });
  }

  setSplitOrderedPlatforms(orderedPlatforms: PlatformType[]): void {
    const preferences = this.preferencesSignal();
    this.updatePreferences({
      ...preferences,
      splitLayout: {
        ...preferences.splitLayout,
        orderedPlatforms: [...orderedPlatforms],
      },
    });
  }

  setSplitLayoutOrientation(orientation: "row" | "column"): void {
    const preferences = this.preferencesSignal();
    this.updatePreferences({
      ...preferences,
      splitLayout: {
        ...preferences.splitLayout,
        orientation,
      },
    });
  }

  getSplitLayoutOrientation(): "row" | "column" {
    return this.preferencesSignal().splitLayout?.orientation ?? "row";
  }

  setSplitEnabledChannelIds(platform: PlatformType, channelIds: string[]): void {
    const preferences = this.preferencesSignal();
    this.updatePreferences({
      ...preferences,
      splitLayout: {
        ...preferences.splitLayout,
        splitEnabledChannelIds: {
          ...(preferences.splitLayout.splitEnabledChannelIds ?? {}),
          [platform]: [...channelIds],
        },
      },
    });
  }

  getSplitEnabledChannelIds(platform: PlatformType): string[] {
    return this.preferencesSignal().splitLayout?.splitEnabledChannelIds?.[platform] ?? [];
  }

  addSplitEnabledChannelId(platform: PlatformType, channelRef: string): void {
    const current = this.getSplitEnabledChannelIds(platform);
    if (!current.includes(channelRef)) {
      this.setSplitEnabledChannelIds(platform, [...current, channelRef]);
    }
  }

  removeSplitEnabledChannelId(platform: PlatformType, channelRef: string): void {
    const current = this.getSplitEnabledChannelIds(platform);
    if (current.includes(channelRef)) {
      this.setSplitEnabledChannelIds(
        platform,
        current.filter((id) => id !== channelRef)
      );
    }
  }

  setChannelOrderForPlatform(platform: PlatformType, channelIds: string[]): void {
    const preferences = this.preferencesSignal();
    this.updatePreferences({
      ...preferences,
      splitLayout: {
        ...preferences.splitLayout,
        orderedChannelIds: {
          ...(preferences.splitLayout.orderedChannelIds ?? {}),
          [platform]: [...channelIds],
        },
      },
    });
  }

  setMixedEnabledChannelIds(channelIds: string[]): void {
    const preferences = this.preferencesSignal();
    this.updatePreferences({
      ...preferences,
      mixedEnabledChannelIds: [...channelIds],
    });
  }

  getMixedEnabledChannelIds(): string[] {
    return [...this.preferencesSignal().mixedEnabledChannelIds];
  }

  addMixedEnabledChannelId(channelRef: string): void {
    const preferences = this.preferencesSignal();
    const current = preferences.mixedEnabledChannelIds;
    if (!current.includes(channelRef)) {
      this.updatePreferences({
        ...preferences,
        mixedEnabledChannelIds: [...current, channelRef],
      });
    }
  }

  removeMixedEnabledChannelId(channelRef: string): void {
    const preferences = this.preferencesSignal();
    const current = preferences.mixedEnabledChannelIds;
    if (current.includes(channelRef)) {
      this.updatePreferences({
        ...preferences,
        mixedEnabledChannelIds: current.filter((id) => id !== channelRef),
      });
    }
  }

  private readPreferences(): DashboardPreferences {
    const storedValue = localStorage.getItem(storageKey);

    if (!storedValue) {
      return defaultPreferences;
    }

    try {
      const parsed = JSON.parse(storedValue) as DashboardPreferences;

      if (
        (parsed.feedMode === "mixed" || parsed.feedMode === "split") &&
        (parsed.densityMode === "compact" || parsed.densityMode === "comfortable") &&
        Array.isArray(parsed.splitLayout?.orderedPlatforms) &&
        Array.isArray(parsed.splitLayout?.hiddenPlatforms) &&
        typeof parsed.splitLayout?.columnWidths === "object"
      ) {
        const mixedEnabled =
          Array.isArray(parsed.mixedEnabledChannelIds) &&
          parsed.mixedEnabledChannelIds.every((id) => typeof id === "string")
            ? [...parsed.mixedEnabledChannelIds]
            : [];

        // Ensure hiddenPlatforms only contains valid platform types
        const validPlatforms = new Set<PlatformType>(["twitch", "kick", "youtube"]);
        let hiddenPlatforms = (parsed.splitLayout.hiddenPlatforms ?? []).filter((p: PlatformType) =>
          validPlatforms.has(p)
        );

        // Migration: If kick or youtube are hidden but user has channels for them, unhide them
        // This fixes the bug where split mode was hiding platforms without checking if channels exist
        try {
          const channelsRaw = localStorage.getItem("unichat-chat-channels");
          if (channelsRaw) {
            const channels = JSON.parse(channelsRaw) as Array<{
              platform: PlatformType;
              isVisible: boolean;
            }>;
            const hasVisibleKick = channels.some((ch) => ch.platform === "kick" && ch.isVisible);
            const hasVisibleYoutube = channels.some(
              (ch) => ch.platform === "youtube" && ch.isVisible
            );

            if (hasVisibleKick && hiddenPlatforms.includes("kick")) {
              hiddenPlatforms = hiddenPlatforms.filter((p) => p !== "kick");
              this.logger.info(
                "DashboardPreferencesService",
                "Migration: Unhid Kick platform (user has visible Kick channels)"
              );
            }
            if (hasVisibleYoutube && hiddenPlatforms.includes("youtube")) {
              hiddenPlatforms = hiddenPlatforms.filter((p) => p !== "youtube");
              this.logger.info(
                "DashboardPreferencesService",
                "Migration: Unhid YouTube platform (user has visible YouTube channels)"
              );
            }
          }
        } catch {
          // Ignore errors reading channels - continue with original hiddenPlatforms
        }

        return {
          ...parsed,
          mixedEnabledChannelIds: mixedEnabled,
          splitLayout: {
            ...parsed.splitLayout,
            hiddenPlatforms,
            columnWidths: {
              twitch: parsed.splitLayout.columnWidths?.twitch ?? 320,
              kick: parsed.splitLayout.columnWidths?.kick ?? 320,
              youtube: parsed.splitLayout.columnWidths?.youtube ?? 320,
            },
            orderedChannelIds: parsed.splitLayout.orderedChannelIds ?? {},
            orientation: parsed.splitLayout?.orientation ?? "row",
            splitEnabledChannelIds: parsed.splitLayout?.splitEnabledChannelIds ?? {},
          },
        };
      }
    } catch {
      return defaultPreferences;
    }

    return defaultPreferences;
  }

  private updatePreferences(preferences: DashboardPreferences): void {
    this.preferencesSignal.set(preferences);
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  }
}
