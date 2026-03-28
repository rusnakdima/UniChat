/* sys lib */
import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
@Component({
  selector: "app-shared-header",
  standalone: true,
  imports: [MatIconModule, RouterLink],
  templateUrl: "./shared-header.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>("");
  readonly showBackButton = input<boolean>(false);
  readonly backLink = input<string>("/");
  readonly backQueryParams = input<Record<string, string | undefined> | undefined>(undefined);
}
