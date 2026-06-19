import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";

import { ChatChannel, PlatformType } from "@models/chat.model";
import { ThemeService } from "@services/core/theme.service";
import { ChannelAvatarService } from "@services/ui/channel-avatar.service";
import { ChatMessagePresentationService } from "@services/ui/chat-message-presentation.service";
import { buildChannelRef } from "@utils/channel-ref.util";

@Component({
  selector: "app-channel-filter-dropdown",
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: "./channel-filter-dropdown.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelFilterDropdownComponent implements AfterViewInit {
  private readonly channelsSource = signal<ChatChannel[]>([]);

  @Input()
  set channels(value: ChatChannel[]) {
    this.channelsSource.set(value);
  }

  readonly channelsSignal = computed(() => this.channelsSource());
  @Input() enabledChannelIds: Set<string> = new Set();
  @Input() visibleChannelCount: number = 0;
  @Output() enabledChannelIdsChange = new EventEmitter<Set<string>>();
  @Output() closeDropdown = new EventEmitter<void>();

  private readonly elementRef = inject(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly showDropdown = signal(false);
  readonly filterSearchQuery = signal("");

  toggleDropdown(): void {
    this.showDropdown.update((v) => !v);
    this.cdr.markForCheck();
  }

  ngAfterViewInit(): void {
    document.addEventListener("click", this.handleDocumentClick.bind(this));
  }

  private handleDocumentClick(event: Event): void {
    if (!this.showDropdown()) {
      return;
    }
    const target = event.target as HTMLElement;
    const isInsideComponent = this.elementRef.nativeElement.contains(target);
    if (!isInsideComponent) {
      this.close();
    }
  }
  readonly themeService = inject(ThemeService);
  readonly themeMode = this.themeService.themeMode;
  private readonly channelAvatars = inject(ChannelAvatarService);
  private readonly presentation = inject(ChatMessagePresentationService);

  readonly filteredChannels = computed(() => {
    const query = this.filterSearchQuery().toLowerCase().trim();
    const channels = this.channelsSignal();
    if (!query) {
      return channels;
    }
    return channels.filter((ch) => ch.channelName.toLowerCase().includes(query));
  });

  readonly selectedCount = computed(() => this.enabledChannelIds.size);

  channelRefFor(channel: ChatChannel): string {
    return buildChannelRef(channel.platform, channel.channelId);
  }

  isChannelEnabled(channelRef: string): boolean {
    return this.enabledChannelIds.has(channelRef);
  }

  toggleChannel(channelRef: string): void {
    const current = new Set(this.enabledChannelIds);
    if (current.has(channelRef)) {
      current.delete(channelRef);
    } else {
      current.add(channelRef);
    }
    this.enabledChannelIdsChange.emit(current);
  }

  selectAll(): void {
    const allRefs = this.channels.filter((ch) => ch.isVisible).map((ch) => this.channelRefFor(ch));
    this.enabledChannelIdsChange.emit(new Set(allRefs));
  }

  clearAll(): void {
    this.enabledChannelIdsChange.emit(new Set());
  }

  close(): void {
    this.showDropdown.set(false);
    this.filterSearchQuery.set("");
    this.closeDropdown.emit();
    this.cdr.markForCheck();
  }

  getChannelImage(channel: ChatChannel): string | null {
    return this.channelAvatars.getChannelImageForChannel(buildChannelRef(channel.platform, channel.channelId));
  }

  getChannelInitial(channelName: string): string {
    return this.channelAvatars.getChannelInitial(channelName);
  }

  platformIconUrl(platform: PlatformType): string {
    return this.presentation.platformIconUrl(platform);
  }

  platformLabel(platform: PlatformType): string {
    return this.presentation.platformLabel(platform);
  }
}
