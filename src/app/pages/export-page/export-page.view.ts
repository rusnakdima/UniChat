/* sys lib */
import { ChangeDetectionStrategy, Component, inject, computed } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { UpperCasePipe } from "@angular/common";

/* services */
import { ChatListService } from "@services/data/chat-list.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import {
  ChatHistoryExportService,
  ExportFormat,
} from "@services/features/chat-history-export.service";
import { ThemeService } from "@services/core/theme.service";

/* models */
import { PlatformType, PLATFORMS } from "@entities/chat.model";

/* helpers */
import { getPlatformLabel } from "@shared/utils/chat.helper";

@Component({
  selector: "app-export-page-view",
  standalone: true,
  imports: [MatIconModule, FormsModule, UpperCasePipe],
  templateUrl: "./export-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportPageView {
  readonly chatListService = inject(ChatListService);
  readonly presentation = inject(ChatMessagePresentationService);
  private readonly chatHistoryExport = inject(ChatHistoryExportService);
  readonly themeService = inject(ThemeService);
  readonly themeMode = this.themeService.themeMode;

  readonly platforms = PLATFORMS;
  readonly channels = computed(() => this.chatListService.channels());
  readonly visibleChannels = computed(() => this.chatListService.getVisibleChannels());

  exportFormat: ExportFormat = "txt";
  exportIncludeTimestamps = true;
  exportIncludePlatform = false;
  exportIncludeBadges = false;
  selectedExportChannelId = "";

  readonly exportStats = () => this.chatHistoryExport.getExportStats();

  getPlatformLbl(platform: PlatformType): string {
    return getPlatformLabel(platform);
  }

  getAccountIcon(accountId: string): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(accountId)}&background=random&size=32`;
  }

  async exportAllHistory(): Promise<void> {
    try {
      await this.chatHistoryExport.exportAllHistory({
        format: this.exportFormat,
        includeTimestamps: this.exportIncludeTimestamps,
        includePlatform: this.exportIncludePlatform,
        includeBadges: this.exportIncludeBadges,
        dateFormat: "iso",
      });
    } catch {
      // export failed
    }
  }

  async exportSelectedChannel(): Promise<void> {
    const channelId = this.selectedExportChannelId;
    if (!channelId) return;

    const channel = this.chatListService.channels().find((ch) => ch.id === channelId);
    if (!channel) return;

    try {
      await this.chatHistoryExport.exportChannelHistory(channel.channelId, channel.platform, {
        format: this.exportFormat,
        includeTimestamps: this.exportIncludeTimestamps,
        includePlatform: this.exportIncludePlatform,
        includeBadges: this.exportIncludeBadges,
        dateFormat: "time",
      });
    } catch {
      // export failed
    }
  }
}
