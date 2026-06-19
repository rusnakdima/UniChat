import { Injectable, inject } from "@angular/core";
import { TauriApiService } from "@app/api/tauri-api.service";
import { EventBusService } from "./event-bus.service";

@Injectable({
  providedIn: "root",
})
export class MainService {
  private readonly api = inject(TauriApiService);
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
