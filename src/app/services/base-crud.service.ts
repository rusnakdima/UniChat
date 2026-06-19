import { Injectable } from "@angular/core";
import { ChatMessage, ChatChannel, ChatAccount, DashboardPreferences } from "@models/chat.model";
import { CustomEmote } from "@services/features/custom-emote-manager.service";

export interface CrudOptions {
  skip?: number;
  limit?: number;
  orderBy?: string;
}

@Injectable({
  providedIn: "root",
})
export abstract class BaseCrudService<T, CreateDto = Partial<T>, UpdateDto = Partial<T>> {
  abstract getAll(filter?: Record<string, unknown>, options?: CrudOptions): Promise<T[]>;
  abstract getById(id: string): Promise<T | null>;
  abstract create(data: CreateDto): Promise<T>;
  abstract update(id: string, data: UpdateDto): Promise<T>;
  abstract delete(id: string): Promise<void>;

  protected extractData<R>(result: unknown): R {
    if (result && typeof result === "object" && "data" in (result as Record<string, unknown>)) {
      return (result as Record<string, unknown>)["data"] as R;
    }
    return result as R;
  }
}
