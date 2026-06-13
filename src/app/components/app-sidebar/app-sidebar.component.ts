/* sys lib */
import { ChangeDetectionStrategy, Component, inject, signal, effect, OnInit } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { Router, NavigationEnd } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter } from "rxjs/operators";

/* services */
import { ThemeService } from "@services/core/theme.service";
interface MenuItem {
  path: string;
  icon: string;
  label: string;
}

@Component({
  selector: "app-sidebar",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./app-sidebar.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppSidebarComponent implements OnInit {
  readonly themeService = inject(ThemeService);

  readonly menu: MenuItem[] = [
    { path: "/dashboard", icon: "forum", label: "UniChat" },
    { path: "/connections", icon: "power", label: "Platforms" },
    { path: "/analytics", icon: "bar_chart", label: "Analytics" },
    { path: "/export", icon: "download", label: "Export Chat" },
    { path: "/settings", icon: "settings", label: "Settings" },
    { path: "/updates", icon: "system_update", label: "Updates" },
    { path: "/about", icon: "info", label: "About" },
  ];

  readonly themeMode = this.themeService.themeMode;

  private readonly router = inject(Router);

  activePath: string = "";

  ngOnInit(): void {
    const navigationEndEvents = toSignal(
      this.router.events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd)
      ),
      { initialValue: null }
    );

    effect(() => {
      const event = navigationEndEvents();
      if (event) {
        this.activePath = event.urlAfterRedirects;
      }
    });

    this.activePath = this.router.url;
  }

  isActive(path: string): boolean {
    return this.activePath === path;
  }

  navigate(path: string): void {
    this.activePath = path;
    void this.router.navigate([path]);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
