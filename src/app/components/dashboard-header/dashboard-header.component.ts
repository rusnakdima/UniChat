/* sys lib */
import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { FeedMode } from "@models/chat.model";

@Component({
  selector: "app-dashboard-header",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./dashboard-header.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardHeaderComponent {
  // Inputs
  readonly feedMode = input.required<FeedMode>();
  readonly pinnedCount = input.required<number>();
  readonly showSearch = input.required<boolean>();
  readonly showPinned = input.required<boolean>();
  readonly showShortcuts = input.required<boolean>();

  // Outputs
  readonly toggleSearch = output<void>();
  readonly togglePinned = output<void>();
  readonly toggleShortcuts = output<void>();
  readonly setFeedMode = output<FeedMode>();
  readonly resetSizes = output<void>();

  readonly feedModes: FeedMode[] = ["mixed", "split"];

  getFeedModeLabel(mode: FeedMode): string {
    return mode === "mixed" ? "Mixed" : "Split";
  }
}
