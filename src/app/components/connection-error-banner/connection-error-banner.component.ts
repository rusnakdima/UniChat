/* sys lib */
import { TitleCasePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, input, output, computed } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { ChannelConnectionError, PlatformType } from "@models/chat.model";

/* services */
import { ConnectionStateService } from "@services/data/connection-state.service";
import { ChatProviderCoordinatorService } from "@services/providers/chat-provider-coordinator.service";
@Component({
  selector: "app-connection-error-banner",
  standalone: true,
  imports: [MatIconModule, MatButtonModule, TitleCasePipe],
  template: `
    @if (error(); as err) {
      <div
        class="flex items-center gap-3 rounded-md border px-4 py-3"
        [class]="
          error()?.isRecoverable
            ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200'
            : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200'
        "
        role="alert"
      >
        <mat-icon
          class="shrink-0"
          [fontSet]="error()?.isRecoverable ? 'material-icons-outlined' : 'material-icons'"
        >
          {{ error()?.isRecoverable ? "warning" : "error" }}
        </mat-icon>
        <div class="flex-1 text-sm">
          <p class="font-medium">{{ error()?.code | titlecase }}</p>
          <p class="text-xs opacity-80">{{ error()?.message }}</p>
        </div>
        @if (error()?.isRecoverable) {
          <button
            mat-button
            color="warn"
            class="shrink-0"
            (click)="retryConnection.emit()"
            aria-label="Retry connection"
          >
            Retry
          </button>
        }
        <button
          mat-icon-button
          class="shrink-0"
          (click)="dismissError.emit()"
          aria-label="Dismiss error"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>
    }
  `,
  host: {
    class: "block w-full",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionErrorBannerComponent {
  private readonly connectionStateService = inject(ConnectionStateService);
  private readonly chatProviderCoordinator = inject(ChatProviderCoordinatorService);

  readonly channelId = input.required<string>();
  readonly platform = input.required<PlatformType>();

  readonly error = computed(() => this.connectionStateService.getChannelError(this.channelId()));

  readonly retryConnection = output<void>();
  readonly dismissError = output<void>();

  onRetry(): void {
    this.chatProviderCoordinator.connectChannel(this.channelId(), this.platform());
    this.retryConnection.emit();
  }

  onDismiss(): void {
    this.connectionStateService.clearError(this.channelId());
    this.dismissError.emit();
  }
}
