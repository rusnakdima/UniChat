/* sys lib */
import { ChangeDetectionStrategy, Component, inject, effect, OnInit } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { Router, NavigationEnd } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter } from "rxjs/operators";

/* services */
import { ThemeService } from "@services/core/theme.service";

interface NavItem {
  path: string;
  icon: string;
  label: string;
}

@Component({
  selector: "app-mobile-nav",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./app-mobile-nav.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppMobileNavComponent implements OnInit {
  readonly themeService = inject(ThemeService);
  readonly router = inject(Router);

  readonly navItems: NavItem[] = [
    { path: "/dashboard", icon: "forum", label: "Chat" },
    { path: "/connections", icon: "power", label: "Links" },
    { path: "/analytics", icon: "bar_chart", label: "Stats" },
    { path: "/export", icon: "download", label: "Export" },
    { path: "/overlay-management", icon: "tv", label: "Overlay" },
    { path: "/settings", icon: "settings", label: "Settings" },
    { path: "/about", icon: "info", label: "About" },
  ];

  readonly themeMode = this.themeService.themeMode;

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
