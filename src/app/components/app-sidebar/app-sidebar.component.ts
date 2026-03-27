import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
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
export class AppSidebarComponent {
  readonly themeService = inject(ThemeService);

  readonly menu: MenuItem[] = [
    { path: "/dashboard", icon: "dashboard", label: "Dashboard" },
    { path: "/overlay-management", icon: "tv", label: "Overlay" },
    { path: "/settings", icon: "settings", label: "Settings" },
  ];

  readonly themeMode = this.themeService.themeMode;

  constructor(private readonly router: Router) {}

  isActive(path: string): boolean {
    return this.router.url === path;
  }

  navigate(path: string): void {
    void this.router.navigate([path]);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
