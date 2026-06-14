// sys lib
import { Injectable, inject, signal, OnDestroy } from "@angular/core";

// models
import { DashboardPreferences, DensityMode, FeedMode, PlatformType } from "@models/chat.model";

// services
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { DashboardPreferencesStorage } from "./dashboard-preferences-storage.service";

@Injectable({
  providedIn: "root",
})
export class DashboardPreferencesService implements OnDestroy {
  private readonly storage = new DashboardPreferencesStorage();
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly preferencesSignal = signal<DashboardPreferences>(this.storage.readPreferences());
  private readonly storageHandler = (ev: StorageEvent) => {
    if (ev.key !== this.storage.getStorageKey()) {
      return;
    }
    this.preferencesSignal.set(this.storage.readPreferences());
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

  setAutoScroll(autoScroll: boolean): void {
    this.updatePreferences({
      ...this.preferencesSignal(),
      autoScroll,
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

  private updatePreferences(preferences: DashboardPreferences): void {
    this.preferencesSignal.set(preferences);
    this.storage.writePreferences(preferences);
  }
}
