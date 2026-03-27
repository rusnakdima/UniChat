import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { UpperCasePipe, KeyValuePipe } from "@angular/common";
import { SessionExportService } from "@services/ui/session-export.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ChatMessage } from "@models/chat.model";

@Component({
  selector: "app-session-export-settings",
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    UpperCasePipe,
    KeyValuePipe,
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
      this.selectedChannels.set(current.filter(id => id !== channelId));
    } else {
      this.selectedChannels.set([...current, channelId]);
    }
  }

  togglePlatform(platform: ChatMessage["platform"]): void {
    const current = this.selectedPlatforms();
    if (current.includes(platform)) {
      this.selectedPlatforms.set(current.filter(p => p !== platform));
    } else {
      this.selectedPlatforms.set([...current, platform]);
    }
  }

  selectAllChannels(): void {
    this.selectedChannels.set(this.channels().map(c => c.channelId));
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
}
