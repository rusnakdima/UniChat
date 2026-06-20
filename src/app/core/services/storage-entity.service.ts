import { Injectable } from "@angular/core";
import { ChatMessage } from "@entities/chat.model";

export interface StorageEntity {
  id: string;
  type: string;
  data: unknown;
}

@Injectable({ providedIn: "root" })
export class StorageEntityService {
  private _entities = new Map<string, StorageEntity>();

  get(id: string): StorageEntity | null {
    return this._entities.get(id) || null;
  }

  save(entity: StorageEntity): void {
    this._entities.set(entity.id, entity);
  }

  delete(id: string): void {
    this._entities.delete(id);
  }

  createChatMessage(message: ChatMessage, channelId?: string): StorageEntity {
    const entity: StorageEntity = {
      id: crypto.randomUUID(),
      type: "chat_message",
      data: { channelId: channelId ?? message.sourceChannelId, message },
    };
    this.save(entity);
    return entity;
  }

  getChatMessagesByChannel(_platform: string, _channelId: string): ChatMessage[] {
    return [];
  }

  deleteChatMessagesByChannel(_channelId: string): void {
    for (const [id, entity] of this._entities) {
      if (
        entity.type === "chat_message" &&
        (entity.data as { channelId?: string }).channelId === _channelId
      ) {
        this._entities.delete(id);
      }
    }
  }
}

export const StorageEntityServiceImpl = StorageEntityService;
