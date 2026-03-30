/* sys lib */
import { Routes } from "@angular/router";

/* layouts */
import { DashboardLayoutComponent } from "@layouts/dashboard-layout.component";

/* views */
import { DashboardView } from "@views/dashboard-view/dashboard.view";
import { OverlayManagementView } from "@views/overlay-management-view/overlay-management.view";
import { OverlayView } from "@views/overlay-view/overlay.view";
import { SettingsPageView } from "@views/settings-page-view/settings-page.view";

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
    component: OverlayView,
  },
  {
    path: "",
    component: DashboardLayoutComponent,
    children: [
      {
        path: "dashboard",
        component: DashboardView,
        resolve: { chatData: ChatDataResolver },
      },
      {
        path: "overlay-management",
        component: OverlayManagementView,
      },
      {
        path: "settings",
        component: SettingsPageView,
      },
    ],
  },
  {
    path: "**",
    redirectTo: "dashboard",
  },
];
