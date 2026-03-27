import { Injectable, computed, inject } from "@angular/core";
import { mockWidgets } from "@views/dashboard-view/dashboard.mock";
import { ChatStateService } from "@services/data/chat-state.service";
import { ConnectionStateService } from "@services/data/connection-state.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";

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
  readonly widgets = computed(() => mockWidgets);
  readonly preferences = this.dashboardPreferencesService.preferences;

  readonly visibleSplitPlatforms = computed(() => {
    const preferences = this.preferences();

    return preferences.splitLayout.orderedPlatforms.filter(
      (platform) => !preferences.splitLayout.hiddenPlatforms.includes(platform)
    );
  });

  readonly featuredWidget = computed(() => this.widgets()[0]);
}
