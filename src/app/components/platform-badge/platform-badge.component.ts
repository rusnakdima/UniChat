/* sys lib */
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/* models */
import { PlatformType } from "@models/chat.model";

/* helpers */
import { getPlatformBadgeClasses, getPlatformLabel } from "@helpers/chat.helper";
@Component({
  selector: "app-platform-badge",
  template: `
    <span
      class="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
      [class]="getPlatformBadgeClasses(platform())"
    >
      {{ getPlatformLabel(platform()) }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformBadgeComponent {
  readonly platform = input.required<PlatformType>();

  getPlatformBadgeClasses = getPlatformBadgeClasses;
  getPlatformLabel = getPlatformLabel;
}
