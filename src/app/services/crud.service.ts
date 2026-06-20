import { Injectable } from "@angular/core";
import { TauriApiService } from "@app/api/api.api.service";
import { Response } from "@entities/response.model";

export interface CrudParams {
  id?: string;
  data?: unknown;
  filter?: unknown;
}

@Injectable({
  providedIn: "root",
})
export class CrudService {
  constructor(private api: TauriApiService) {}

  async execute<T = unknown>(
    operation: string,
    entity: string,
    params: CrudParams = {}
  ): Promise<T> {
    return this.api.invoke<T>("crud_execute", {
      operation,
      entity,
      id: params.id,
      data: params.data,
      filter: params.filter,
    });
  }

  async get<T = unknown>(entity: string, id: string): Promise<T> {
    return this.execute<T>("get", entity, { id });
  }

  async getAll<T = unknown>(entity: string, filter?: unknown): Promise<T[]> {
    const result = await this.execute<{ [key: string]: T[] }>("get_all", entity, { filter });
    return Object.values(result ?? {})[0] ?? [];
  }

  async create<T = unknown>(entity: string, data: unknown): Promise<T> {
    return this.execute<T>("create", entity, { data });
  }

  async update<T = unknown>(entity: string, id: string, data: unknown): Promise<T> {
    return this.execute<T>("update", entity, { id, data });
  }

  async patch<T = unknown>(entity: string, id: string, data: unknown): Promise<T> {
    return this.execute<T>("patch", entity, { id, data });
  }

  async delete(entity: string, id: string): Promise<void> {
    await this.execute("delete", entity, { id });
  }

  async count(entity: string): Promise<number> {
    return this.execute<number>("count", entity, {});
  }

  async exists(entity: string, id: string): Promise<boolean> {
    return this.execute<boolean>("exists", entity, { id });
  }
}
