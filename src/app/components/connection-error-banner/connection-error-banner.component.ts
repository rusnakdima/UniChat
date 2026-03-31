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
import { buildChannelRef } from "@utils/channel-ref.util";
@Component({
  selector: "app-connection-error-banner",
  standalone: true,
  imports: [MatIconModule, MatButtonModule, TitleCasePipe],
  templateUrl: "./connection-error-banner.component.html",
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

  readonly error = computed(() =>
    this.connectionStateService.getChannelError(buildChannelRef(this.platform(), this.channelId()))
  );

  readonly retryConnection = output<void>();
  readonly dismissError = output<void>();

  onRetry(): void {
    this.chatProviderCoordinator.connectChannel(this.channelId(), this.platform());
    this.retryConnection.emit();
  }

  onDismiss(): void {
    this.connectionStateService.clearError(buildChannelRef(this.platform(), this.channelId()));
    this.dismissError.emit();
  }
}
