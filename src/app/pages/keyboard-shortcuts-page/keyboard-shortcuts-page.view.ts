/* sys lib */
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";

/* services */
import {
  KeyboardShortcutsService,
  KeyboardShortcutView,
} from "@services/ui/keyboard-shortcuts.service";
import { ThemeService } from "@services/core/theme.service";

@Component({
  selector: "app-keyboard-shortcuts-page-view",
  standalone: true,
  imports: [FormsModule, MatIconModule],
  templateUrl: "./keyboard-shortcuts-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardShortcutsPageView {
  private readonly keyboardShortcutsService = inject(KeyboardShortcutsService);
  private readonly themeService = inject(ThemeService);

  readonly themeMode = this.themeService.themeMode;
  readonly shortcuts = this.keyboardShortcutsService.shortcuts;
  readonly editBindingId = signal<string | null>(null);
  readonly editKeys = signal("");
  readonly conflictError = signal(false);

  startEdit(row: KeyboardShortcutView): void {
    this.editBindingId.set(row.bindingId);
    this.editKeys.set(row.keys);
    this.conflictError.set(false);
  }

  cancelEdit(): void {
    this.editBindingId.set(null);
    this.conflictError.set(false);
  }

  saveEdit(): void {
    const id = this.editBindingId();
    if (!id) {
      return;
    }
    const ok = this.keyboardShortcutsService.updateBindingKeys(id, this.editKeys());
    this.conflictError.set(!ok);
    if (ok) {
      this.cancelEdit();
    }
  }

  resetDefaults(): void {
    this.keyboardShortcutsService.resetBindingsToDefaults();
    this.cancelEdit();
  }
}
