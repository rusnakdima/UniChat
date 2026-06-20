/* sys lib */
import { ChangeDetectionStrategy, Component, signal, computed, inject } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { DecimalPipe } from "@angular/common";

/* services */
import { ThemeService } from "@services/core/theme.service";
import {
  AnalyticsService,
  AnalyticsStats,
  PlatformDistribution,
} from "@services/features/analytics.service";
import { UnifiedStorageService } from "@core/services/unified-storage.service";
import { ConnectionStateService } from "@services/data/connection-state.service";

@Component({
  selector: "app-analytics-page-view",
  standalone: true,
  imports: [MatIconModule, FormsModule, DecimalPipe],
  templateUrl: "./analytics-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPageView {
  readonly themeService = inject(ThemeService);
  readonly themeMode = this.themeService.themeMode;

  private readonly analyticsService = inject(AnalyticsService);
  private readonly chatStorageService = inject(UnifiedStorageService);
  private readonly connectionStateService = inject(ConnectionStateService);

  readonly timeRangeOptions = ["Last 24 Hours", "Last 7 Days"];
  readonly selectedTimeRange = signal("Last 24 Hours");

  readonly stats = computed<AnalyticsStats>(() => {
    const allMessages = this.chatStorageService.allMessages();
    const connections = this.connectionStateService.getConnections();
    const timeRange = this.selectedTimeRange();

    const filteredMessages = this.analyticsService.filterMessagesByTimeRange(
      allMessages,
      timeRange
    );
    const previousMessages = this.analyticsService.getPreviousPeriodMessages();

    return this.analyticsService.computeStats(filteredMessages, connections, previousMessages);
  });

  readonly platformDistribution = computed<PlatformDistribution[]>(() => {
    const allMessages = this.chatStorageService.allMessages();
    const timeRange = this.selectedTimeRange();
    const filteredMessages = this.analyticsService.filterMessagesByTimeRange(
      allMessages,
      timeRange
    );
    return this.analyticsService.computePlatformDistribution(filteredMessages);
  });
}
