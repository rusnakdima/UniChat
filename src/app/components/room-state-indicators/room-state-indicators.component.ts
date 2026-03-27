import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  effect,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { RoomState } from "@models/chat.model";
import { ConnectionStateService } from "@services/data/connection-state.service";

@Component({
  selector: "app-room-state-indicators",
  imports: [MatIconModule, MatTooltipModule],
  template: `
    @if (roomState(); as state) {
      <div class="flex items-center gap-1">
        <!-- Slow Mode -->
        @if (state.isSlowMode) {
          <span
            class="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-400"
            [matTooltip]="'Slow mode: ' + (state.slowModeWaitTime ?? 0) + 's between messages'"
            matTooltipShowDelay="150"
          >
            <mat-icon class="!h-3 !w-3">schedule</mat-icon>
            <span>{{ state.slowModeWaitTime }}s</span>
          </span>
        }

        <!-- Followers Only -->
        @if (state.isFollowersOnly) {
          <span
            class="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            [matTooltip]="'Followers-only: ' + (state.followersOnlyMinutes ?? 0) + ' min required'"
            matTooltipShowDelay="150"
          >
            <mat-icon class="!h-3 !w-3">favorite</mat-icon>
            <span>{{ state.followersOnlyMinutes }}m</span>
          </span>
        }

        <!-- Subscribers Only -->
        @if (state.isSubscribersOnly) {
          <span
            class="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            matTooltip="Subscribers-only mode"
            matTooltipShowDelay="150"
          >
            <mat-icon class="!h-3 !w-3">star</mat-icon>
          </span>
        }

        <!-- Emotes Only -->
        @if (state.isEmotesOnly) {
          <span
            class="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
            matTooltip="Emotes-only mode"
            matTooltipShowDelay="150"
          >
            <mat-icon class="!h-3 !w-3">sentiment_satisfied_alt</mat-icon>
          </span>
        }

        <!-- R9K (Unique Messages) -->
        @if (state.isR9k) {
          <span
            class="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            matTooltip="Unique messages only (R9K)"
            matTooltipShowDelay="150"
          >
            <mat-icon class="!h-3 !w-3">fingerprint</mat-icon>
          </span>
        }
      </div>
    }
  `,
  host: {
    class: "flex items-center gap-1",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomStateIndicatorsComponent {
  private readonly connectionStateService = inject(ConnectionStateService);

  readonly channelId = input.required<string>();
  
  readonly roomState = signal<RoomState | undefined>(undefined);

  constructor() {
    effect(() => {
      const state = this.connectionStateService.getRoomState(this.channelId());
      this.roomState.set(state);
    });
  }
}
