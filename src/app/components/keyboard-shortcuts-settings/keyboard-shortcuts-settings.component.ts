/* sys lib */
import { ChangeDetectionStrategy, Component, inject, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";

/* services */
import {
  KeyboardShortcutsService,
  KeyboardShortcutView,
} from "@services/ui/keyboard-shortcuts.service";

@Component({
  selector: "app-keyboard-shortcuts-settings",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./keyboard-shortcuts-settings.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardShortcutsSettingsComponent {
  private readonly keyboardShortcutsService = inject(KeyboardShortcutsService);

  readonly shortcuts = computed(() => this.keyboardShortcutsService.shortcuts);
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
