import { Injectable, inject } from "@angular/core";
import { TauriApiService } from "@app/api/api.api.service";

@Injectable({
  providedIn: "root",
})
export class ApiService {
  private readonly tauri = inject(TauriApiService);

  async get<T>(endpoint: string, args?: Record<string, unknown>): Promise<T> {
    return this.tauri.invoke<T>(endpoint, args);
  }

  async post<T>(endpoint: string, args?: Record<string, unknown>): Promise<T> {
    return this.tauri.invoke<T>(endpoint, args);
  }
}
