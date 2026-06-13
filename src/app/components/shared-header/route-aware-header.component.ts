/* sys lib */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  output,
} from "@angular/core";
import { Router, NavigationEnd } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter } from "rxjs/operators";
import { MatIconModule } from "@angular/material/icon";

/* services */
import { ThemeService } from "@services/core/theme.service";

interface RouteInfo {
  title: string;
  subtitle: string;
}

@Component({
  selector: "app-route-aware-header",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./route-aware-header.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteAwareHeaderComponent {
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);

  readonly themeMode = this.themeService.themeMode;
  readonly openShortcutDialog = output<void>();

  readonly currentPath = signal<string>("");

  readonly routeInfo = computed<RouteInfo>(() => {
    const path = this.currentPath();
    switch (path) {
      case "/dashboard":
        return { title: "UniChat", subtitle: "Live unified chat feed" };
      case "/connections":
        return { title: "Connections", subtitle: "Manage platform connections" };
      case "/analytics":
        return { title: "Analytics", subtitle: "Chat statistics and insights" };
      case "/export":
        return { title: "Export", subtitle: "Export chat history" };
      case "/settings":
        return { title: "Settings", subtitle: "App preferences" };
      case "/overlay-management":
        return { title: "Overlay Management", subtitle: "OBS overlay settings" };
      case "/keyboard-shortcuts":
        return { title: "Keyboard Shortcuts", subtitle: "" };
      default:
        return { title: "UniChat", subtitle: "" };
    }
  });

  readonly isDashboard = computed(() => this.currentPath() === "/dashboard");

  constructor() {
    const navigationEndEvents = toSignal(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd)
      ),
      { initialValue: null }
    );

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.currentPath.set(event.urlAfterRedirects);
      });

    this.currentPath.set(this.router.url);
  }

  onOpenShortcuts(): void {
    this.openShortcutDialog.emit();
  }
}
