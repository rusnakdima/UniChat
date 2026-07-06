/* sys lib */
import { Routes } from "@angular/router";

/* SDUI - routes are handled by SchemaRouterService */
export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "dashboard",
  },
  {
    path: "overlay",
    loadComponent: () => import("@tauri-front/shared").then((m) => m.SchemaRouteViewerComponent),
  },
  {
    path: "",
    loadComponent: () => import("@tauri-front/shared").then((m) => m.SchemaRouteViewerComponent),
  },
  {
    path: "**",
    redirectTo: "dashboard",
  },
];
