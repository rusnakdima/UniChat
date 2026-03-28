/* sys lib */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { Router, NavigationEnd, RouterOutlet } from "@angular/router";
import { filter } from "rxjs";

/* components */
import { AppSidebarComponent } from "@components/app-sidebar/app-sidebar.component";
import { SharedHeaderComponent } from "@components/shared-header/shared-header.component";
@Component({
  selector: "app-layout",
  standalone: true,
  imports: [RouterOutlet, AppSidebarComponent, SharedHeaderComponent],
  templateUrl: "./app-layout.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLayoutComponent {
  private readonly router = inject(Router);

  private readonly currentPath = signal<string>(this.router.url.split("?")[0]);

  readonly showSidebar = computed(() => {
    // Overlay preview (`/overlay`) should stay clean for OBS.
    return this.currentPath() !== "/overlay";
  });

  readonly showHeader = computed(() => {
    // Hide header on dashboard and overlay pages
    const path = this.currentPath();
    return path !== "/overlay" && path !== "/dashboard" && path !== "";
  });

  readonly headerTitle = computed(() => {
    const path = this.currentPath();
    if (path === "/settings") {
      return "Settings";
    }
    if (path === "/overlay-management") {
      return "Overlay Management";
    }
    return "";
  });

  readonly headerSubtitle = computed(() => {
    const path = this.currentPath();
    if (path === "/settings") {
      return "Manage your connections and channels";
    }
    if (path === "/overlay-management") {
      return "Configure your OBS overlay settings";
    }
    return "";
  });

  constructor() {
    // Track URL so we can hide sidebar/header on `/overlay`.
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentPath.set(e.urlAfterRedirects.split("?")[0]);
      });
  }
}
