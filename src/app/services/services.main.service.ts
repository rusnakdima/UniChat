/* angular */
import { inject, Injectable } from "@angular/core";
/* library */
import { EventBusService, InvokeWrapperService } from "@tauri-front/shared";

@Injectable({
  providedIn: "root",
})
export class MainService {
  private readonly api = inject(InvokeWrapperService);
  private readonly eventBus = inject(EventBusService);

  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.eventBus.emit("main:initializing");

    try {
      this.initialized = true;
      this.eventBus.emit("main:initialized");
    } catch (error) {
      this.eventBus.emit("main:error", error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
