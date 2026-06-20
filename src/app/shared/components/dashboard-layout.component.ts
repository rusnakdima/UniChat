/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  effect,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterOutlet, NavigationEnd } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter } from "rxjs/operators";

/* services */
import { ThemeService } from "@services/core/theme.service";

/* components */
import { AppSidebarComponent } from "@components/app-sidebar/app-sidebar.component";
import { AppMobileNavComponent } from "@components/app-sidebar/app-mobile-nav.component";
import { DebugPanelComponent } from "@components/debug-panel/debug-panel.component";
import { RouteAwareHeaderComponent } from "@components/shared-header/route-aware-header.component";
import { KeyboardShortcutsDialogComponent } from "@components/keyboard-shortcuts-dialog/keyboard-shortcuts-dialog.component";

/** Sidebar width in pixels (matches w-16 = 64px) */
const SIDEBAR_WIDTH = 64;

@Component({
  selector: "app-dashboard-layout",
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatIconModule,
    AppSidebarComponent,
    AppMobileNavComponent,
    DebugPanelComponent,
    RouteAwareHeaderComponent,
    KeyboardShortcutsDialogComponent,
  ],
  templateUrl: "./dashboard-layout.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayoutComponent {
  readonly themeService = inject(ThemeService);
  readonly themeMode = this.themeService.themeMode;
  private readonly router = inject(Router);

  readonly currentPath = signal<string>("");
  readonly showShortcutDialog = signal(false);

  readonly isOnDashboard = computed(() => this.currentPath() === "/dashboard");

  readonly showDebugPanel = signal(false);

  readonly SIDEBAR_WIDTH = SIDEBAR_WIDTH;

  constructor() {
    this.showDebugPanel.set(
      typeof window !== "undefined" && window.localStorage?.getItem("unichat_debug") === "true"
    );

    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event: StorageEvent) => {
        if (event.key === "unichat_debug") {
          this.showDebugPanel.set(event.newValue === "true");
        }
      });

      window.addEventListener("unichat_debug_change", ((event: CustomEvent) => {
        this.showDebugPanel.set(event.detail);
      }) as EventListener);
    }

    const navigationEndEvents = toSignal(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd)
      ),
      { initialValue: null }
    );

    effect(() => {
      const event = navigationEndEvents();
      if (event) {
        this.currentPath.set(event.urlAfterRedirects);
      }
    });

    this.currentPath.set(this.router.url);
  }

  openShortcutDialog(): void {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      void this.router.navigate(["/keyboard-shortcuts"]);
    } else {
      this.showShortcutDialog.set(true);
    }
  }

  closeShortcutDialog(): void {
    this.showShortcutDialog.set(false);
  }
}
