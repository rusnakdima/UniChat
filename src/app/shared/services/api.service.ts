import { Injectable, inject } from "@angular/core";
import { InvokeWrapperService } from "@tauri-front/shared";

@Injectable({
  providedIn: "root",
})
export class ApiService {
  private readonly tauri = inject(InvokeWrapperService);

  async get<T>(endpoint: string, args?: Record<string, unknown>): Promise<T> {
    return this.tauri.invoke<T>(endpoint, args);
  }

  async post<T>(endpoint: string, args?: Record<string, unknown>): Promise<T> {
    return this.tauri.invoke<T>(endpoint, args);
  }
}
