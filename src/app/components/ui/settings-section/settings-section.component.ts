/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  computed,
  effect,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-settings-section",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./settings-section.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSectionComponent {
  /** Section title (required) */
  title = input.required<string>();

  /** Section description (optional) */
  description = input<string | undefined>(undefined);

  /** Unique ID for this section (for state management) */
  sectionId = input<string>("");

  /** Controlled collapsed state from parent */
  collapsedState = input<boolean>(false);

  /** Emit when collapse state changes */
  collapsedChange = output<boolean>();

  /** Internal collapsed state */
  private _collapsed = signal(false);

  /** Whether section is currently collapsed */
  collapsed = computed(() => this._collapsed());

  constructor() {
    // Sync internal state with parent controlled state
    effect(() => {
      this._collapsed.set(this.collapsedState());
    });
  }

  /** Toggle collapsed state */
  toggle(): void {
    this._collapsed.update((v) => !v);
    this.collapsedChange.emit(this._collapsed());
  }
}
