import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-radio",
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./radio.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RadioComponent {
  @Input() value: any;
  @Input() radioValue: any;
  @Input() disabled: boolean = false;
  @Input() label: string = "";
  @Input() labelClass: string = "";
  @Input() inputClass: string = "";
  @Input() labelTextClass: string = "";

  @Output() valueChange = new EventEmitter<any>();
  @Output() change = new EventEmitter<Event>();
  @Output() click = new EventEmitter<Event>();

  onModelChange(value: any): void {
    this.valueChange.emit(value);
  }

  onRadioChange(event: Event): void {
    this.change.emit(event);
    const target = event.target as HTMLInputElement;
  }

  onRadioClick(event: Event): void {
    // Prevent browser's default focus-scroll behavior that causes page teleportation
    event.preventDefault();
    this.click.emit(event);
  }
}
