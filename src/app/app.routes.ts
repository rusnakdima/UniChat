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
    ],
  },
  {
    path: "**",
    redirectTo: "dashboard",
  },
];
