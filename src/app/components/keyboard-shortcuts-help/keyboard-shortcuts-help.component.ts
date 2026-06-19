/* sys lib */
import { ChangeDetectionStrategy, Component, inject, output, computed } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

/* services */
import { KeyboardShortcutsService } from "@services/ui/keyboard-shortcuts.service";
@Component({
  selector: "app-keyboard-shortcuts-help",
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  templateUrl: "./keyboard-shortcuts-help.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardShortcutsHelpComponent {
  private readonly keyboardShortcutsService = inject(KeyboardShortcutsService);

  readonly shortcutsByCategory = computed(() => this.keyboardShortcutsService.shortcutsByCategory);
  readonly closed = output<void>();
}
