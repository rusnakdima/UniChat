import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-checkbox",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./checkbox.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckboxComponent {
  @Input() checked: boolean = false;
  @Input() disabled: boolean = false;
  @Input() label: string = "";
  @Input() labelClass: string = "";
  @Input() inputClass: string = "";
  @Input() labelTextClass: string = "";

  @Output() checkedChange = new EventEmitter<boolean>();
  @Output() change = new EventEmitter<boolean>();
  @Output() click = new EventEmitter<Event>();

  onModelChange(value: boolean): void {
    this.checked = value;
    this.checkedChange.emit(value);
  }

  onCheckboxChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.checked = target.checked;
    this.change.emit(target.checked);
  }

  onCheckboxClick(event: Event): void {
    // Prevent browser's default focus-scroll behavior that causes page teleportation
    // Use preventDefault on the focus event, not click, to allow state toggling
    this.click.emit(event);
  }
}
