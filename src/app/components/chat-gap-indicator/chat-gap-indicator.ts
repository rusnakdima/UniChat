/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  OnDestroy,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

/* services */
import { ReconnectionService } from "@services/core/reconnection.service";

/**
 * Chat Gap Indicator Component
 * Displays a notification when messages were missed during reconnection
 */
@Component({
  selector: "app-chat-gap-indicator",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./chat-gap-indicator.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatGapIndicator implements OnInit, OnDestroy {
  private readonly reconnectionService = inject(ReconnectionService);

  readonly channelId = input.required<string>();

  hasGap = false;
  missedCount = 0;

  private unsubscribe: (() => void) | null = null;

  ngOnInit(): void {
    this.hasGap = this.reconnectionService.hasGap(this.channelId());
    this.missedCount = this.reconnectionService.getMissedCount(this.channelId());

    // Subscribe to gap updates
    this.unsubscribe = this.reconnectionService.onGap(
      this.channelId(),
      (missedCount, _platform) => {
        this.hasGap = missedCount > 0;
        this.missedCount = missedCount;
      }
    );
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  dismiss(): void {
    this.reconnectionService.clearGap(this.channelId());
    this.hasGap = false;
    this.missedCount = 0;
  }
}
