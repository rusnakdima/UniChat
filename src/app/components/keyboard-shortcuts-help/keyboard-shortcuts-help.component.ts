/* sys lib */
import { ChangeDetectionStrategy, Component, inject, output } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

/* services */
import { KeyboardShortcutsService } from "@services/ui/keyboard-shortcuts.service";
@Component({
  selector: "app-keyboard-shortcuts-help",
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  template: `
    <div
      class="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-white/10 dark:bg-slate-900/50"
      >
        <div class="flex items-center gap-3">
          <mat-icon class="!h-6 !w-6 text-slate-600 dark:text-slate-400">keyboard</mat-icon>
          <h2 class="text-lg font-semibold">Keyboard Shortcuts</h2>
        </div>
        <button
          type="button"
          (click)="closed.emit()"
          class="rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 dark:hover:bg-white/10"
          aria-label="Close"
        >
          <mat-icon class="!h-5 !w-5">close</mat-icon>
        </button>
      </div>

      <!-- Shortcuts Grid -->
      <div class="flex-1 overflow-y-auto p-6">
        <div class="grid gap-6 md:grid-cols-2">
          <!-- Navigation -->
          <div>
            <h3 class="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Navigation
            </h3>
            <div class="space-y-2">
              @for (shortcut of shortcutsByCategory().navigation; track shortcut.keys) {
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600 dark:text-slate-400">
                    {{ shortcut.description }}
                  </span>
                  <kbd
                    class="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-mono text-slate-700 dark:border-white/20 dark:bg-white/5 dark:text-slate-300"
                  >
                    {{ shortcut.keys }}
                  </kbd>
                </div>
              }
            </div>
          </div>

          <!-- Actions -->
          <div>
            <h3 class="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Actions</h3>
            <div class="space-y-2">
              @for (shortcut of shortcutsByCategory().actions; track shortcut.keys) {
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600 dark:text-slate-400">
                    {{ shortcut.description }}
                  </span>
                  <kbd
                    class="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-mono text-slate-700 dark:border-white/20 dark:bg-white/5 dark:text-slate-300"
                  >
                    {{ shortcut.keys }}
                  </kbd>
                </div>
              }
            </div>
          </div>

          <!-- Overlay -->
          <div>
            <h3 class="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Overlay</h3>
            <div class="space-y-2">
              @for (shortcut of shortcutsByCategory().overlay; track shortcut.keys) {
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600 dark:text-slate-400">
                    {{ shortcut.description }}
                  </span>
                  <kbd
                    class="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-mono text-slate-700 dark:border-white/20 dark:bg-white/5 dark:text-slate-300"
                  >
                    {{ shortcut.keys }}
                  </kbd>
                </div>
              }
            </div>
          </div>

          <!-- General -->
          <div>
            <h3 class="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">General</h3>
            <div class="space-y-2">
              @for (shortcut of shortcutsByCategory().general; track shortcut.keys) {
                <div class="flex items-center justify-between">
                  <span class="text-sm text-slate-600 dark:text-slate-400">
                    {{ shortcut.description }}
                  </span>
                  <kbd
                    class="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-mono text-slate-700 dark:border-white/20 dark:bg-white/5 dark:text-slate-300"
                  >
                    {{ shortcut.keys }}
                  </kbd>
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="border-t border-slate-200 bg-slate-50 px-6 py-4 text-center text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-400"
      >
        Press
        <kbd
          class="mx-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono dark:border-white/20 dark:bg-white/5"
          >Ctrl+?</kbd
        >
        or
        <kbd
          class="mx-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono dark:border-white/20 dark:bg-white/5"
          >F1</kbd
        >
        to open this help
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyboardShortcutsHelpComponent {
  private readonly keyboardShortcutsService = inject(KeyboardShortcutsService);

  readonly shortcutsByCategory = this.keyboardShortcutsService.shortcutsByCategory;
  readonly closed = output<void>();
}
