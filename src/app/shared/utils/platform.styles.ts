/**
 * Platform-specific styling constants
 * Centralized color schemes and CSS classes for consistent branding
 */

import { PlatformType } from "@models/chat.model";
import { PlatformStatus, WidgetStatus } from "@models/chat.model";

/**
 * Platform badge classes for standard display
 */
export const PLATFORM_BADGE_CLASSES: Record<PlatformType, string> = {
  twitch:
    "bg-fuchsia-500/15 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-500/30 dark:bg-fuchsia-500/20 dark:text-fuchsia-200 dark:ring-fuchsia-400/30",
  kick: "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30",
  youtube:
    "bg-rose-500/15 text-rose-700 ring-1 ring-inset ring-rose-500/30 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-400/30",
} as const;

/**
 * Platform badge classes for mixed filter bar (channel disabled/muted)
 */
export const PLATFORM_BADGE_CLASSES_MIXED_DISABLED: Record<PlatformType, string> = {
  twitch:
    "bg-fuchsia-200/90 text-fuchsia-950 ring-1 ring-inset ring-fuchsia-600/40 dark:bg-fuchsia-950/55 dark:text-fuchsia-100 dark:ring-fuchsia-400/35",
  kick: "bg-emerald-200/90 text-emerald-950 ring-1 ring-inset ring-emerald-600/40 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-400/35",
  youtube:
    "bg-rose-200/90 text-rose-950 ring-1 ring-inset ring-rose-600/40 dark:bg-rose-950/55 dark:text-rose-100 dark:ring-rose-400/35",
} as const;

/**
 * Platform badge classes for mixed filter bar (channel enabled)
 */
export const PLATFORM_BADGE_CLASSES_MIXED_ENABLED: Record<PlatformType, string> = {
  twitch:
    "bg-fuchsia-500/50 text-white ring-1 ring-inset ring-fuchsia-200/40 dark:bg-fuchsia-700 dark:text-white dark:ring-fuchsia-900/50",
  kick: "bg-emerald-500/50 text-white ring-1 ring-inset ring-emerald-200/40 dark:bg-emerald-700 dark:text-white dark:ring-emerald-900/50",
  youtube:
    "bg-rose-500/50 text-white ring-1 ring-inset ring-rose-200/40 dark:bg-rose-700 dark:text-white dark:ring-rose-900/50",
} as const;

/**
 * Status indicator classes for connection/widget states
 */
export const STATUS_CLASSES: Record<PlatformStatus | WidgetStatus, string> = {
  disconnected:
    "bg-slate-500/15 text-slate-700 ring-1 ring-inset ring-slate-500/30 dark:bg-slate-500/20 dark:text-slate-200 dark:ring-slate-400/30",
  connecting:
    "bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-400/30",
  connected:
    "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/30",
  reconnecting:
    "bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-500/30 dark:bg-sky-500/20 dark:text-sky-200 dark:ring-sky-400/30",
  live: "bg-cyan-500/15 text-cyan-700 ring-1 ring-inset ring-cyan-500/30 dark:bg-cyan-500/20 dark:text-cyan-200 dark:ring-cyan-400/30",
  draft:
    "bg-slate-500/15 text-slate-700 ring-1 ring-inset ring-slate-500/30 dark:bg-slate-500/20 dark:text-slate-200 dark:ring-slate-400/30",
} as const;

/**
 * Status label text for connection/widget states
 */
export const STATUS_LABELS: Record<PlatformStatus | WidgetStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  live: "Live",
  draft: "Draft",
} as const;
