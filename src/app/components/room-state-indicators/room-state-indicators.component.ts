/* sys lib */
import { ChangeDetectionStrategy, Component, inject, input, signal, effect } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";

/* models */
import { ConnectionInfo } from "@services/data/connection-state.service";

/* services */
import { ConnectionStateService } from "@services/data/connection-state.service";
@Component({
  selector: "app-room-state-indicators",
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: "./room-state-indicators.component.html",
  host: {
    class: "flex items-center gap-1",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomStateIndicatorsComponent {
  private readonly connectionStateService = inject(ConnectionStateService);

  readonly channelId = input.required<string>();

  readonly roomState = signal<ConnectionInfo | undefined>(undefined);

  constructor() {
    effect(() => {
      const state = this.connectionStateService.getRoomState(this.channelId());
      this.roomState.set(state);
    });
  }
}
