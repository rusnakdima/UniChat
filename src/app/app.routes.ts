/* sys lib */
import { Routes } from "@angular/router";

/* layouts */
import { DashboardLayoutComponent } from "@layouts/dashboard-layout.component";

/* resolvers */
import { ChatDataResolver } from "@resolvers/chat-data.resolver";

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "dashboard",
  },
  {
    path: "overlay",
    loadComponent: () => import("@views/overlay-view/overlay.view").then((m) => m.OverlayView),
  },
  {
    path: "",
    component: DashboardLayoutComponent,
    children: [
      {
        path: "dashboard",
        loadComponent: () =>
          import("@views/dashboard-view/dashboard.view").then((m) => m.DashboardView),
        resolve: { chatData: ChatDataResolver },
      },
      {
        path: "connections",
        loadComponent: () =>
          import("@views/connections-page-view/connections-page.view").then(
            (m) => m.ConnectionsPageView
          ),
      },
      {
        path: "analytics",
        loadComponent: () =>
          import("@views/analytics-page-view/analytics-page.view").then((m) => m.AnalyticsPageView),
      },
      {
        path: "export",
        loadComponent: () =>
          import("@views/export-page-view/export-page.view").then((m) => m.ExportPageView),
      },
      {
        path: "overlay-management",
        loadComponent: () =>
          import("@views/overlay-management-view/overlay-management.view").then(
            (m) => m.OverlayManagementView
          ),
      },
      {
        path: "settings",
        loadComponent: () =>
          import("@views/settings-page-view/settings-page.view").then((m) => m.SettingsPageView),
      },
      {
        path: "updates",
        loadComponent: () =>
          import("@views/updates-page-view/updates-page.view").then((m) => m.UpdatesPageView),
      },
      {
        path: "about",
        loadComponent: () =>
          import("@views/about-page-view/about-page.view").then((m) => m.AboutPageView),
      },
      {
        path: "keyboard-shortcuts",
        loadComponent: () =>
          import("@views/keyboard-shortcuts-page-view/keyboard-shortcuts-page.view").then(
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
