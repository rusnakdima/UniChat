import { store } from '../../../../tauri-front-shared/projects/shared/dist/stores/signalStore';
import { themeStore } from '../../../../tauri-front-shared/projects/shared/dist/services/theme-service';
import { toasts, show, dismiss, success, error, warning, info, clear } from '../../../../tauri-front-shared/projects/shared/dist/stores/toast-store';
import { ipcService } from '../../../../tauri-front-shared/projects/shared/dist/services/ipcService';
import { schemaParser } from '../../../../tauri-front-shared/projects/shared/dist/services/schemaParser';
import { schemaLoader } from '../../../../tauri-front-shared/projects/shared/dist/services/schemaLoader';
import { ThemeService } from '../../../../tauri-front-shared/projects/shared/dist/services/theme-service';
import { i18n, locale, t, getLocaleInfo, SUPPORTED_LOCALES } from '../../../../tauri-front-shared/projects/shared/dist/services/i18n-service';
import { platformStore, isTauri, isNativeApp } from '../../../../tauri-front-shared/projects/shared/dist/services/platform-service';
import { eventBus, EventBusService } from '../../../../tauri-front-shared/projects/shared/dist/services/eventBusService';
import { handlerExecutor, HandlerExecutorService } from '../../../../tauri-front-shared/projects/shared/dist/services/handlerExecutorService';

export { store, themeStore, toasts, show, dismiss, success, error, warning, info, clear, ipcService, schemaParser, schemaLoader, ThemeService, i18n, locale, t, getLocaleInfo, SUPPORTED_LOCALES, platformStore, isTauri, isNativeApp, eventBus, EventBusService, handlerExecutor, HandlerExecutorService };

export function sortBy(items, key, direction = 'asc') {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

export function groupByField(items, field) {
  const result = {};
  if (field === 'platform') {
    const platforms = ['twitch', 'kick', 'youtube', 'trovo'];
    for (const p of platforms) {
      result[p] = [];
    }
  }
  for (const item of items) {
    const key = String(item[field]);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
