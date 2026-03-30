/* sys lib */
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterOutlet } from "@angular/router";

/* components */
import { AppSidebarComponent } from "@components/app-sidebar/app-sidebar.component";

/** Sidebar width in pixels (matches w-14 = 56px) */
const SIDEBAR_WIDTH = 56;

@Component({
  selector: "app-dashboard-layout",
  standalone: true,
  imports: [CommonModule, RouterOutlet, AppSidebarComponent],
  templateUrl: "./dashboard-layout.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayoutComponent {
  readonly showSidebar = computed(() => {
    // Overlay preview (`/overlay`) should stay clean for OBS.
    return true; // Sidebar is always shown in dashboard layout
  });

  readonly SIDEBAR_WIDTH = SIDEBAR_WIDTH;
}
