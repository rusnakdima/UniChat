import { Injectable, computed, signal } from "@angular/core";
import { ChatMessage, PlatformType } from "@models/chat.model";
import { sortMessagesByRecency } from "@helpers/chat.helper";

@Injectable({
  providedIn: "root",
})
export class ChatStorageService {
  private readonly channelMessagesSignal = signal<Record<string, ChatMessage[]>>({});

  readonly channelMessages = this.channelMessagesSignal.asReadonly();

  readonly allMessages = computed(() => {
    const allMessages: ChatMessage[] = [];
    const messagesByChannel = this.channelMessagesSignal();

    for (const messages of Object.values(messagesByChannel)) {
      allMessages.push(...messages);
    }

    return sortMessagesByRecency(allMessages);
  });

  readonly messagesByPlatform = computed(() => {
    const allMessages = this.allMessages();

    return {
      twitch: allMessages.filter((msg) => msg.platform === "twitch"),
      kick: allMessages.filter((msg) => msg.platform === "kick"),
      youtube: allMessages.filter((msg) => msg.platform === "youtube"),
    };
  });

  getMessagesByChannel(channelId: string): ChatMessage[] {
    return this.channelMessagesSignal()[channelId] ?? [];
  }

  getMessagesByPlatform(platform: PlatformType): ChatMessage[] {
    return this.messagesByPlatform()[platform];
  }

  addMessage(channelId: string, message: ChatMessage): void {
    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[channelId] ?? [];
      const existingIndex = channelMessages.findIndex((msg) => msg.id === message.id);

      if (existingIndex !== -1) {
        const updatedMessages = [...channelMessages];
        updatedMessages[existingIndex] = message;
        return { ...store, [channelId]: updatedMessages };
      }

      return {
        ...store,
        [channelId]: sortMessagesByRecency([...channelMessages, message]),
      };
    });
  }

  addMessages(channelId: string, messages: ChatMessage[]): void {
    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[channelId] ?? [];
      const messageMap = new Map(channelMessages.map((msg) => [msg.id, msg]));

      for (const message of messages) {
        messageMap.set(message.id, message);
      }

      return {
        ...store,
        [channelId]: sortMessagesByRecency(Array.from(messageMap.values())),
      };
    });
  }

  removeMessage(channelId: string, messageId: string): void {
    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[channelId];

      if (!channelMessages) {
        return store;
      }

      return {
        ...store,
        [channelId]: channelMessages.filter((msg) => msg.id !== messageId),
      };
    });
  }

  updateMessage(channelId: string, messageId: string, updates: Partial<ChatMessage>): void {
    this.channelMessagesSignal.update((store) => {
      const channelMessages = store[channelId];

      if (!channelMessages) {
        return store;
      }

      return {
        ...store,
        [channelId]: channelMessages.map((msg) =>
          msg.id === messageId ? { ...msg, ...updates } : msg
        ),
      };
    });
  }
}
