/* sys lib */
import { Injectable, inject } from "@angular/core";

/**
 * Lazy Service Loader
 *
 * Provides lazy loading for non-critical services to improve initial load time.
 * Services are loaded on-demand when first accessed.
 *
 * Usage:
 * ```typescript
 * const emoteManager = await LazyServiceLoader.load<CustomEmoteManagerService>(
 *   () => import('@services/features/custom-emote-manager.service')
 *     .then(m => m.CustomEmoteManagerService)
 * );
 * ```
 */
@Injectable({
  providedIn: "root",
})
export class LazyServiceLoader {
  private static readonly loadedServices = new Map<string, unknown>();
  private static readonly loadingServices = new Map<string, Promise<unknown>>();

  /**
   * Load a service lazily
   * @param loader - Function that returns a promise resolving to the service class
   * @param serviceName - Unique identifier for the service
   */
  static async load<T>(loader: () => Promise<{ new (): T }>, serviceName: string): Promise<T> {
    // Check if already loaded
    const cached = this.loadedServices.get(serviceName) as T | undefined;
    if (cached) {
      return Promise.resolve(cached);
    }

    // Check if already loading
    const existingLoad = this.loadingServices.get(serviceName) as Promise<T> | undefined;
    if (existingLoad) {
      return existingLoad;
    }

    // Start loading
    const loadPromise = (async () => {
      try {
        const ServiceClass = await loader();
        const instance = new ServiceClass();
        this.loadedServices.set(serviceName, instance);
        return instance;
      } finally {
        this.loadingServices.delete(serviceName);
      }
    })();

    this.loadingServices.set(serviceName, loadPromise);
    return loadPromise;
  }

  /**
   * Preload a service (load in background)
   * @param loader - Function that returns a promise resolving to the service class
   * @param serviceName - Unique identifier for the service
   */
  static preload<T>(loader: () => Promise<{ new (): T }>, serviceName: string): void {
    // Start loading but don't wait for it
    this.load(loader, serviceName).catch((err) => {
      console.warn(`Failed to preload service ${serviceName}:`, err);
    });
  }

  /**
   * Check if a service is already loaded
   */
  static isLoaded(serviceName: string): boolean {
    return this.loadedServices.has(serviceName);
  }

  /**
   * Get a loaded service instance (without loading)
   */
  static get<T>(serviceName: string): T | undefined {
    return this.loadedServices.get(serviceName) as T | undefined;
  }

  /**
   * Clear a loaded service from cache
   */
  static clear(serviceName: string): void {
    this.loadedServices.delete(serviceName);
  }

  /**
   * Clear all loaded services
   */
  static clearAll(): void {
    this.loadedServices.clear();
    this.loadingServices.clear();
  }
}

/**
 * Lazy loaded service identifiers
 */
export const LAZY_SERVICES = {
  EMOTE_MANAGER: "emote-manager",
  EXPORT_SERVICE: "export-service",
  MODERATION_SERVICE: "moderation-service",
  KEYBOARD_SHORTCUTS: "keyboard-shortcuts",
  LINK_PREVIEW: "link-preview",
  USER_PROFILE_POPOVER: "user-profile-popover",
} as const;
