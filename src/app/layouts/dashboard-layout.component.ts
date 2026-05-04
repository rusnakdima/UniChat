/* sys lib */
import { ChangeDetectionStrategy, Component, computed, signal, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterOutlet } from "@angular/router";

/* components */
import { AppSidebarComponent } from "@components/app-sidebar/app-sidebar.component";
import { AppMobileNavComponent } from "@components/app-sidebar/app-mobile-nav.component";
import { DebugPanelComponent } from "@components/debug-panel/debug-panel.component";
import { ENVIRONMENT } from "../../environments/environment";

/** Sidebar width in pixels (matches w-14 = 56px) */
const SIDEBAR_WIDTH = 56;

@Component({
  selector: "app-dashboard-layout",
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    AppSidebarComponent,
    AppMobileNavComponent,
    DebugPanelComponent,
  ],
  templateUrl: "./dashboard-layout.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayoutComponent implements OnDestroy {
  readonly showSidebar = computed(() => {
    return true;
  });

  readonly showDebugPanel = computed(() => {
    if (ENVIRONMENT.DEBUG_PANEL_ENABLED) {
      return true;
    }
    if (typeof window !== "undefined" && window.localStorage?.getItem("unichat_debug") === "true") {
      return true;
    }
    return false;
  });

  readonly SIDEBAR_WIDTH = SIDEBAR_WIDTH;

  readonly isDesktop = signal(window.innerWidth >= 1024);

  private readonly resizeHandler = () => {
    this.isDesktop.set(window.innerWidth >= 1024);
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.resizeHandler);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.resizeHandler);
    }
  }
}
