/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { NgClass } from "@angular/common";

/* services */
import {
  CustomEmoteManagerService,
  CustomEmote,
  EmoteCategory,
} from "@services/features/custom-emote-manager.service";

/**
 * Emote Picker Component
 *
 * Provides a searchable emote picker with:
 * - Search functionality
 * - Category tabs
 * - Recent emotes
 * - Add custom emote dialog
 */
@Component({
  selector: "app-emote-picker",
  standalone: true,
  imports: [FormsModule, MatIconModule, MatTooltipModule, NgClass],
  templateUrl: "./emote-picker.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmotePickerComponent {
  private readonly emoteManager = inject(CustomEmoteManagerService);

  readonly emoteSelected = output<CustomEmote>();
  readonly closePicker = output<void>();

  readonly isOpen = input(false);

  readonly searchQuery = signal("");
  readonly selectedCategory = signal<string>("recent");
  readonly showAddEmoteForm = signal(false);
  readonly newEmoteCode = signal("");
  readonly newEmoteUrl = signal("");

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>("searchInput");

  readonly filteredEmotes = () => {
    const query = this.searchQuery();
    if (query.trim()) {
      return this.emoteManager.searchEmotes(query);
    }

    const category = this.selectedCategory();
    if (category === "recent") {
      return this.emoteManager.getRecentEmotes(50);
    }

    const categories = this.emoteManager.categories;
    const cat = categories.find((c: EmoteCategory) => c.id === category);
    return cat?.emotes ?? [];
  };

  readonly categories = () => this.emoteManager.categories;
  readonly totalEmotes = () => this.emoteManager.emotes.length;

  onEmoteClick(emote: CustomEmote): void {
    this.emoteSelected.emit(emote);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.closePicker.emit();
    }
  }

  toggleAddEmoteForm(): void {
    this.showAddEmoteForm.update((show) => !show);
  }

  addCustomEmote(): void {
    const code = this.newEmoteCode().trim();
    const url = this.newEmoteUrl().trim();

    if (code && url) {
      this.emoteManager.addEmote(code, url);
      this.newEmoteCode.set("");
      this.newEmoteUrl.set("");
      this.showAddEmoteForm.set(false);
      this.selectedCategory.set("custom");
    }
  }

  cancelAddEmote(): void {
    this.newEmoteCode.set("");
    this.newEmoteUrl.set("");
    this.showAddEmoteForm.set(false);
  }

  selectCategory(categoryId: string): void {
    this.selectedCategory.set(categoryId);
    this.searchQuery.set("");
  }

  trackByEmoteId(_index: number, emote: CustomEmote): string {
    return emote.id;
  }
}
