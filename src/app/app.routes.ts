/* sys lib */
import { Routes } from "@angular/router";

/* layouts */
import { DashboardLayoutComponent } from "@shared/components/dashboard-layout.component";

/* resolvers */
import { ChatDataResolver } from "@features/chat/services/chat-data.resolver";

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "dashboard",
  },
  {
    path: "overlay",
    loadComponent: () => import("@pages/overlay-page/overlay-page.view").then((m) => m.OverlayView),
  },
  {
    path: "",
    component: DashboardLayoutComponent,
    children: [
      {
        path: "dashboard",
        loadComponent: () =>
          import("@pages/dashboard-page/dashboard-page.view").then((m) => m.DashboardView),
        resolve: { chatData: ChatDataResolver },
      },
      {
        path: "connections",
        loadComponent: () =>
          import("@pages/connections-page/connections-page.view").then(
            (m) => m.ConnectionsPageView
          ),
      },
      {
        path: "analytics",
        loadComponent: () =>
          import("@pages/analytics-page/analytics-page.view").then((m) => m.AnalyticsPageView),
      },
      {
        path: "export",
        loadComponent: () =>
          import("@pages/export-page/export-page.view").then((m) => m.ExportPageView),
      },
      {
        path: "overlay-management",
        loadComponent: () =>
          import("@pages/overlay-management-page/overlay-management-page.view").then(
            (m) => m.OverlayManagementView
          ),
      },
      {
        path: "settings",
        loadComponent: () =>
          import("@pages/settings-page/settings-page.view").then((m) => m.SettingsPageView),
      },
      {
        path: "about",
        loadComponent: () =>
          import("@pages/about-page/about-page.view").then((m) => m.AboutPageView),
      },
      {
        path: "keyboard-shortcuts",
        loadComponent: () =>
          import("@pages/keyboard-shortcuts-page/keyboard-shortcuts-page.view").then(
            (m) => m.KeyboardShortcutsPageView
          ),
      },
    ],
  },
  {
    path: "**",
    redirectTo: "dashboard",
  },
];
