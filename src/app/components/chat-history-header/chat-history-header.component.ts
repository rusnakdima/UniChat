import { ChangeDetectionStrategy, Component, inject, input, output, signal } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { ChatHistoryLoadState } from "@models/chat.model";
import { ChatStorageService } from "@services/data/chat-storage.service";
import { RoomStateIndicatorsComponent } from "@components/room-state-indicators/room-state-indicators.component";

@Component({
  selector: "app-chat-history-header",
  imports: [MatIconModule, MatProgressSpinnerModule, RoomStateIndicatorsComponent],
  templateUrl: "./chat-history-header.component.html",
  host: {
    class:
      "flex shrink-0 items-center justify-center border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-900/50",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatHistoryHeaderComponent {
  private readonly chatStorage = inject(ChatStorageService);

  /** Channel ID to load history for. If not provided, loads for all channels (mixed feed). */
  readonly channelId = input<string | undefined>(undefined);
  /** Platform of the channel (to avoid loading Twitch history for Kick channels with same name) */
  readonly platform = input<string | undefined>(undefined);
  readonly loadHistory = output<{
    channelId: string | undefined;
    platform: string | undefined;
    count: number;
  }>();

  readonly isLoading = signal(false);
  readonly hasError = signal(false);
  readonly hasMore = signal(true);

  onLoadPreviousClick(): void {
    if (this.isLoading() || !this.hasMore()) {
      return;
    }

    this.isLoading.set(true);
    this.hasError.set(false);

    this.loadHistory.emit({
      channelId: this.channelId(),
      platform: this.platform(),
      count: 100,
    });
  }

  setLoadingComplete(success: boolean, hasMore: boolean): void {
    this.isLoading.set(false);
    this.hasError.set(!success);
    this.hasMore.set(hasMore);
  }
}
