import { Injectable, signal } from "@angular/core";
import { DashboardPreferences, DensityMode, FeedMode, PlatformType } from "@models/chat.model";

const storageKey = "unichat-dashboard-preferences";

const defaultPreferences: DashboardPreferences = {
  feedMode: "mixed",
  densityMode: "comfortable",
  mixedDisabledChannelIds: [],
  splitLayout: {
    orderedPlatforms: ["twitch", "kick", "youtube"],
    hiddenPlatforms: [],
    columnWidths: {
      twitch: 320,
      kick: 320,
      youtube: 320,
    },
    orderedChannelIds: {},
  },
};

@Injectable({
  providedIn: "root",
})
export class DashboardPreferencesService {
  private readonly preferencesSignal = signal<DashboardPreferences>(this.readPreferences());

  readonly preferences = this.preferencesSignal.asReadonly();

  constructor() {
    // Keep multiple overlay documents in sync (OBS + app) via `storage` events.
    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("storage", (ev) => {
      if (ev.key !== storageKey) {
        return;
      }
      this.preferencesSignal.set(this.readPreferences());
    });
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

  setMixedDisabledChannelIds(channelIds: string[]): void {
    const preferences = this.preferencesSignal();
    this.updatePreferences({
      ...preferences,
      mixedDisabledChannelIds: [...channelIds],
    });
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
        const mixedDisabled =
          Array.isArray(parsed.mixedDisabledChannelIds) &&
          parsed.mixedDisabledChannelIds.every((id) => typeof id === "string")
            ? [...parsed.mixedDisabledChannelIds]
            : [];

        return {
          ...parsed,
          mixedDisabledChannelIds: mixedDisabled,
          splitLayout: {
            ...parsed.splitLayout,
            columnWidths: {
              twitch: parsed.splitLayout.columnWidths?.twitch ?? 320,
              kick: parsed.splitLayout.columnWidths?.kick ?? 320,
              youtube: parsed.splitLayout.columnWidths?.youtube ?? 320,
            },
            orderedChannelIds: parsed.splitLayout.orderedChannelIds ?? {},
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
