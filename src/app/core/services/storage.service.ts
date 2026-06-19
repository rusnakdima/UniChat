import { Injectable, inject } from "@angular/core";
import { TauriApiService } from "@app/api/tauri-api.service";

@Injectable({
  providedIn: "root",
})
export class StorageService {
  private readonly tauri = inject(TauriApiService);

  async get<T>(key: string): Promise<T | null> {
    const result = await this.tauri.invoke<{ data?: T }>("storage_get", { key });
    return result.data ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.tauri.invoke("storage_set", { key, value });
  }

  async remove(key: string): Promise<void> {
    await this.tauri.invoke("storage_remove", { key });
  }

  async clear(): Promise<void> {
    await this.tauri.invoke("storage_clear");
  }

  async keys(): Promise<string[]> {
    const result = await this.tauri.invoke<{ keys?: string[] }>("storage_keys");
    return result.keys ?? [];
  }
}
