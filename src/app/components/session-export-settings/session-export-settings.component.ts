/* sys lib */
import { UpperCasePipe, KeyValuePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";

/* models */
import { ChatMessage } from "@models/chat.model";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { SessionExportService } from "@services/ui/session-export.service";
import { buildChannelRef } from "@utils/channel-ref.util";

/* components */
import { CheckboxComponent } from "@components/ui/checkbox/checkbox.component";
import { RadioComponent } from "@components/ui/radio/radio.component";
@Component({
  selector: "app-session-export-settings",
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    UpperCasePipe,
    KeyValuePipe,
    CheckboxComponent,
    RadioComponent,
  ],
  templateUrl: "./session-export-settings.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionExportSettingsComponent {
  private readonly sessionExportService = inject(SessionExportService);
  private readonly chatListService = inject(ChatListService);

  readonly format = signal<"json" | "csv">("json");
  readonly includeMetadata = signal(true);
  readonly selectedChannels = signal<string[]>([]);
  readonly selectedPlatforms = signal<ChatMessage["platform"][]>([]);
  readonly startTime = signal("");
  readonly endTime = signal("");

  readonly channels = computed(() => this.chatListService.getVisibleChannels());
  readonly platforms: ChatMessage["platform"][] = ["twitch", "kick", "youtube"];

  readonly preview = computed(() => {
    return this.sessionExportService.getExportPreview({
      format: this.format(),
      includeMetadata: this.includeMetadata(),
      channels: this.selectedChannels().length > 0 ? this.selectedChannels() : undefined,
      platforms: this.selectedPlatforms().length > 0 ? this.selectedPlatforms() : undefined,
      startTime: this.startTime() || undefined,
      endTime: this.endTime() || undefined,
    });
  });

  toggleChannel(channelId: string): void {
    const current = this.selectedChannels();
    if (current.includes(channelId)) {
      this.selectedChannels.set(current.filter((id) => id !== channelId));
    } else {
      this.selectedChannels.set([...current, channelId]);
    }
  }

  togglePlatform(platform: ChatMessage["platform"]): void {
    const current = this.selectedPlatforms();
    if (current.includes(platform)) {
      this.selectedPlatforms.set(current.filter((p) => p !== platform));
    } else {
      this.selectedPlatforms.set([...current, platform]);
    }
  }

  selectAllChannels(): void {
    this.selectedChannels.set(this.channels().map((c) => buildChannelRef(c.platform, c.channelId)));
  }

  clearChannels(): void {
    this.selectedChannels.set([]);
  }

  export(): void {
    this.sessionExportService.export({
      format: this.format(),
      includeMetadata: this.includeMetadata(),
      channels: this.selectedChannels().length > 0 ? this.selectedChannels() : undefined,
      platforms: this.selectedPlatforms().length > 0 ? this.selectedPlatforms() : undefined,
      startTime: this.startTime() || undefined,
      endTime: this.endTime() || undefined,
    });
  }

  channelRefFor(channel: ReturnType<ChatListService["getVisibleChannels"]>[number]): string {
    return buildChannelRef(channel.platform, channel.channelId);
  }
}
