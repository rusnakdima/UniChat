/**
 * IndexedDB Service for Chat History Caching
 *
 * Provides offline storage for chat history to improve performance
 * and enable offline access to recent messages.
 */

import { Injectable } from "@angular/core";
import { ChatMessage } from "@models/chat.model";

const DB_NAME = "unichat-chat-history";
const DB_VERSION = 1;
const STORE_NAME = "messages";

interface ChatHistoryStore {
  id: string;
  channelId: string;
  platform: string;
  message: ChatMessage;
  timestamp: number;
}

@Injectable({
  providedIn: "root",
})
export class ChatHistoryDbService {
  private db: IDBDatabase | null = null;
  private isOpening = false;
  private openPromise: Promise<IDBDatabase> | null = null;

  /**
   * Open IndexedDB database
   */
  private async openDb(): Promise<IDBDatabase> {
    if (this.db) {
      return Promise.resolve(this.db);
    }

    if (this.isOpening && this.openPromise) {
      return this.openPromise;
    }

    this.isOpening = true;
    this.openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.isOpening = false;
        this.openPromise = null;
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isOpening = false;
        this.openPromise = null;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("channelId", "channelId", { unique: false });
          store.createIndex("platform", "platform", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });

    return this.openPromise;
  }

  /**
   * Store a single message
   */
  async storeMessage(message: ChatMessage, channelId: string): Promise<void> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const record: ChatHistoryStore = {
        id: message.id,
        channelId,
        platform: message.platform,
        message,
        timestamp: Date.now(),
      };

      await this.requestToPromise(store.add(record));
    } catch (error) {
      console.warn("[ChatHistoryDB] Failed to store message:", error);
    }
  }

  /**
   * Store multiple messages in batch
   */
  async storeMessages(messages: ChatMessage[], channelId: string): Promise<void> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      for (const message of messages) {
        const record: ChatHistoryStore = {
          id: message.id,
          channelId,
          platform: message.platform,
          message,
          timestamp: Date.now(),
        };
        store.add(record);
      }

      await this.transactionToPromise(transaction);
    } catch (error) {
      console.warn("[ChatHistoryDB] Failed to store messages:", error);
    }
  }

  /**
   * Get messages for a channel
   */
  async getMessages(channelId: string, limit: number = 100): Promise<ChatMessage[]> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("channelId");

      return new Promise((resolve, reject) => {
        const request = index.getAll(IDBKeyRange.only(channelId));
        request.onsuccess = () => {
          const records = request.result as ChatHistoryStore[];
          const messages = records
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map((r) => r.message);
          resolve(messages);
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  /**
   * Get messages older than a timestamp (for pagination)
   */
  async getMessagesBefore(
    channelId: string,
    beforeTimestamp: number,
    limit: number = 100
  ): Promise<ChatMessage[]> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("channelId");

      return new Promise((resolve, reject) => {
        const request = index.getAll(IDBKeyRange.only(channelId));
        request.onsuccess = () => {
          const records = request.result as ChatHistoryStore[];
          const messages = records
            .filter((r) => r.timestamp < beforeTimestamp)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map((r) => r.message);
          resolve(messages);
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  /**
   * Delete messages for a channel
   */
  async deleteChannelMessages(channelId: string): Promise<void> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("channelId");

      const request = index.getAllKeys(IDBKeyRange.only(channelId));
      request.onsuccess = async () => {
        const keys = request.result as string[];
        for (const key of keys) {
          await this.requestToPromise(store.delete(key));
        }
      };
    } catch (error) {
      console.warn("[ChatHistoryDB] Failed to delete channel messages:", error);
    }
  }

  /**
   * Delete a single message
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      await this.requestToPromise(store.delete(messageId));
    } catch (error) {
      console.warn("[ChatHistoryDB] Failed to delete message:", error);
    }
  }

  /**
   * Clear all messages
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      await this.requestToPromise(store.clear());
    } catch (error) {
      console.warn("[ChatHistoryDB] Failed to clear all messages:", error);
    }
  }

  /**
   * Get storage stats
   */
  async getStats(): Promise<{ totalMessages: number; channels: string[] }> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);

      const countRequest = store.count();
      const channels = await new Promise<string[]>((resolve) => {
        const request = store.openCursor();
        const channelSet = new Set<string>();
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            channelSet.add(cursor.value.channelId);
            cursor.continue();
          } else {
            resolve(Array.from(channelSet));
          }
        };
      });

      const totalMessages = await this.requestToPromise<number>(countRequest);
      return { totalMessages, channels };
    } catch {
      return { totalMessages: 0, channels: [] };
    }
  }

  /**
   * Clean up old messages (older than 24 hours)
   */
  async cleanupOldMessages(maxAgeHours: number = 24): Promise<number> {
    try {
      const db = await this.openDb();
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;

      let deletedCount = 0;
      await new Promise<void>((resolve) => {
        const request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            if (cursor.value.timestamp < cutoffTime) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
      });

      return deletedCount;
    } catch {
      return 0;
    }
  }

  /**
   * Check if IndexedDB is available
   */
  isAvailable(): boolean {
    return typeof indexedDB !== "undefined";
  }

  /**
   * Helper to convert IDBRequest to Promise
   */
  private requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Helper to convert IDBTransaction to Promise
   */
  private transactionToPromise(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
