/* sys lib */
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

/* models */
import { PlatformType } from "@models/chat.model";

/* helpers */
import { getPlatformBadgeClasses, getPlatformLabel } from "@shared/utils/chat.helper";
@Component({
  selector: "app-platform-badge",
  templateUrl: "./platform-badge.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformBadgeComponent {
  readonly platform = input.required<PlatformType>();

  getPlatformBadgeClasses = getPlatformBadgeClasses;
  getPlatformLabel = getPlatformLabel;
}
