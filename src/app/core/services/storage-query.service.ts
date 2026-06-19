import { Injectable, inject } from "@angular/core";
import { TauriApiService } from "@app/api/tauri-api.service";

export interface StorageQueryOptions {
  skip?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}

export interface StorageQueryResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

@Injectable({
  providedIn: "root",
})
export class StorageQueryService {
  private readonly tauri = inject(TauriApiService);

  async query<T>(
    entityType: string,
    filter?: Record<string, unknown>,
    options?: StorageQueryOptions
  ): Promise<StorageQueryResult<T>> {
    const result = await this.tauri.invoke<StorageQueryResult<T>>("query_storage", {
      entityType,
      filter: filter ?? {},
      skip: options?.skip ?? 0,
      limit: options?.limit ?? 100,
      orderBy: options?.orderBy ?? "id",
      orderDirection: options?.orderDirection ?? "desc",
    });
    return result;
  }

  async count(entityType: string, filter?: Record<string, unknown>): Promise<number> {
    const result = await this.tauri.invoke<{ count?: number }>("count_storage", {
      entityType,
      filter: filter ?? {},
    });
    return result.count ?? 0;
  }

  async exists(entityType: string, id: string): Promise<boolean> {
    const result = await this.tauri.invoke<{ exists?: boolean }>("exists_storage", {
      entityType,
      id,
    });
    return result.exists ?? false;
  }
}
