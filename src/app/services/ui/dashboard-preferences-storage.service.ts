import { inject } from "@angular/core";
import { PlatformType, PLATFORMS } from "@models/chat.model";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { DashboardPreferences } from "@models/chat.model";

const storageKey = "unichat-dashboard-preferences";

const defaultPreferences: DashboardPreferences = {
  feedMode: "mixed",
  densityMode: "comfortable",
  autoScroll: true,
  mixedEnabledChannelIds: [],
  splitLayout: {
    orderedPlatforms: PLATFORMS,
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

export class DashboardPreferencesStorage {
  private readonly logger = inject(LOGGER_SERVICE);

  readPreferences(): DashboardPreferences {
    const storedValue = localStorage.getItem(storageKey);

    if (!storedValue) {
      return defaultPreferences;
    }

    try {
      const parsed = JSON.parse(storedValue) as DashboardPreferences;

      if (
        (parsed.feedMode === "mixed" || parsed.feedMode === "split") &&
        (parsed.densityMode === "compact" || parsed.densityMode === "comfortable") &&
        typeof parsed.autoScroll === "boolean" &&
        Array.isArray(parsed.splitLayout?.orderedPlatforms) &&
        Array.isArray(parsed.splitLayout?.hiddenPlatforms) &&
        typeof parsed.splitLayout?.columnWidths === "object"
      ) {
        const mixedEnabled =
          Array.isArray(parsed.mixedEnabledChannelIds) &&
          parsed.mixedEnabledChannelIds.every((id) => typeof id === "string")
            ? [...parsed.mixedEnabledChannelIds]
            : [];

        const validPlatforms = new Set<PlatformType>(PLATFORMS);
        let hiddenPlatforms = (parsed.splitLayout.hiddenPlatforms ?? []).filter((p: PlatformType) =>
          validPlatforms.has(p)
        );

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
              this.logger.info("Migration: Unhid Kick platform (user has visible Kick channels)", {
                source: "DashboardPreferencesService",
              });
            }
            if (hasVisibleYoutube && hiddenPlatforms.includes("youtube")) {
              hiddenPlatforms = hiddenPlatforms.filter((p) => p !== "youtube");
              this.logger.info(
                "Migration: Unhid YouTube platform (user has visible YouTube channels)",
                { source: "DashboardPreferencesService" }
              );
            }
          }
        } catch {
          // Ignore errors reading channels - continue with original hiddenPlatforms
        }

        return {
          ...parsed,
          autoScroll: parsed.autoScroll ?? true,
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

  writePreferences(preferences: DashboardPreferences): void {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  }

  getStorageKey(): string {
    return storageKey;
  }
}
