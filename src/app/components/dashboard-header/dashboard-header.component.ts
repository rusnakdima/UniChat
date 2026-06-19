/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  inject,
  computed,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

/* services */
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { ThemeService } from "@services/core/theme.service";

/* models */
import { PlatformType, PLATFORMS } from "@entities/chat.model";

type PlatformFilter = "all" | "twitch" | "kick" | "youtube";

@Component({
  selector: "app-dashboard-header",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./dashboard-header.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardHeaderComponent {
  readonly presentation = inject(ChatMessagePresentationService);
  readonly themeService = inject(ThemeService);
  readonly themeMode = this.themeService.themeMode;

  // Inputs
  readonly pinnedCount = input.required<number>();
  readonly showSearch = input.required<boolean>();
  readonly showPinned = input.required<boolean>();
  readonly showShortcuts = input.required<boolean>();

  // Outputs
  readonly toggleSearch = output<void>();
  readonly togglePinned = output<void>();
  readonly toggleShortcuts = output<void>();
  readonly platformFilterChange = output<PlatformFilter>();

  readonly activeFilter = signal<PlatformFilter>("all");
  readonly platforms = PLATFORMS;

  setActiveFilter(filter: PlatformFilter): void {
    this.activeFilter.set(filter);
    this.platformFilterChange.emit(filter);
  }
}
