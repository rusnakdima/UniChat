/* sys lib */
import { Injectable, computed, inject } from "@angular/core";

/* services */
import { ChatStateService } from "@services/data/chat-state.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";

/* models */
import { WidgetConfig } from "@models/chat.model";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    id: "widget-main",
    name: "Main Stage",
    status: "live",
    filter: "all",
    sceneHint: "Studio A browser source",
    themeHint: "Aurora glass",
    port: 1450,
  },
];

@Injectable({
  providedIn: "root",
})
export class DashboardStateService {
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly chatStateService = inject(ChatStateService);
  private readonly dashboardPreferencesService = inject(DashboardPreferencesService);

  readonly connections = this.connectionStateService.connections;
  readonly messages = this.chatStateService.messages;
  readonly splitFeed = this.chatStateService.splitFeed;
  readonly widgets = computed(() => DEFAULT_WIDGETS);
  readonly preferences = this.dashboardPreferencesService.preferences;

  readonly visibleSplitPlatforms = computed(() => {
    const preferences = this.preferences();

    return preferences.splitLayout.orderedPlatforms.filter(
      (platform) => !preferences.splitLayout.hiddenPlatforms.includes(platform)
    );
  });

  readonly featuredWidget = computed(() => this.widgets()[0]);
}
