import { Injectable, inject } from "@angular/core";
import { ChatMessage, ChatChannel, ChatAccount, DashboardPreferences } from "@models/chat.model";
import { CustomEmote } from "@services/features/custom-emote-manager.service";

export interface StorageEntityService {
  getChatMessages(filter?: any): Promise<ChatMessage[]>;
  getChatMessagesByChannel(
    platform: string,
    channelId: string,
    skip?: number,
    limit?: number
  ): Promise<ChatMessage[]>;
  createChatMessage(message: Partial<ChatMessage>): Promise<ChatMessage>;
  updateChatMessage(id: string, data: Partial<ChatMessage>): Promise<ChatMessage>;
  deleteChatMessage(id: string): Promise<void>;
  deleteChatMessagesByChannel(platform: string, channelId: string): Promise<void>;

  getChatChannels(filter?: any): Promise<ChatChannel[]>;
  getChatChannelByPlatformAndId(platform: string, channelId: string): Promise<ChatChannel | null>;
  createChatChannel(channel: Partial<ChatChannel>): Promise<ChatChannel>;
  updateChatChannel(id: string, data: Partial<ChatChannel>): Promise<ChatChannel>;
  deleteChatChannel(id: string): Promise<void>;

  getChatAccounts(filter?: any): Promise<ChatAccount[]>;
  getChatAccountByPlatformAndUser(platform: string, userId: string): Promise<ChatAccount | null>;
  getChatAccountsByPlatform(platform: string): Promise<ChatAccount[]>;
  createChatAccount(account: Partial<ChatAccount>): Promise<ChatAccount>;
  updateChatAccount(id: string, data: Partial<ChatAccount>): Promise<ChatAccount>;
  deleteChatAccount(id: string): Promise<void>;

  getDashboardPreferences(userId: string): Promise<DashboardPreferences>;
  getOrCreateDashboardPreferences(userId: string): Promise<DashboardPreferences>;
  updateDashboardPreferences(
    id: string,
    data: Partial<DashboardPreferences>
  ): Promise<DashboardPreferences>;

  getCustomEmotes(platform: string, channelId?: string): Promise<CustomEmote[]>;
  createCustomEmote(emote: Partial<CustomEmote>): Promise<CustomEmote>;
  updateCustomEmote(id: string, data: Partial<CustomEmote>): Promise<CustomEmote>;
  deleteCustomEmote(id: string): Promise<void>;
}

@Injectable({
  providedIn: "root",
})
export class StorageEntityServiceImpl implements StorageEntityService {
  async getChatMessages(filter?: any): Promise<ChatMessage[]> {
    const result = await (window as any).__TAURI__.core.invoke("get_chat_messages", { filter });
    return this.extractData(result);
  }

  async getChatMessagesByChannel(
    platform: string,
    channelId: string,
    skip?: number,
    limit?: number
  ): Promise<ChatMessage[]> {
    const result = await (window as any).__TAURI__.core.invoke("get_chat_messages_by_channel", {
      platform,
      sourceChannelId: channelId,
      skip,
      limit,
    });
    return this.extractData(result);
  }

  async createChatMessage(message: Partial<ChatMessage>): Promise<ChatMessage> {
    const result = await (window as any).__TAURI__.core.invoke("create_chat_message", {
      data: message,
    });
    return this.extractData(result);
  }

  async updateChatMessage(id: string, data: Partial<ChatMessage>): Promise<ChatMessage> {
    const result = await (window as any).__TAURI__.core.invoke("update_chat_message", { id, data });
    return this.extractData(result);
  }

  async deleteChatMessage(id: string): Promise<void> {
    await (window as any).__TAURI__.core.invoke("delete_chat_message", { id });
  }

  async deleteChatMessagesByChannel(platform: string, channelId: string): Promise<void> {
    await (window as any).__TAURI__.core.invoke("delete_chat_messages_by_channel", {
      platform,
      sourceChannelId: channelId,
    });
  }

  async getChatChannels(filter?: any): Promise<ChatChannel[]> {
    const result = await (window as any).__TAURI__.core.invoke("get_chat_channels", { filter });
    return this.extractData(result);
  }

  async getChatChannelByPlatformAndId(
    platform: string,
    channelId: string
  ): Promise<ChatChannel | null> {
    const result = await (window as any).__TAURI__.core.invoke(
      "get_chat_channel_by_platform_and_id",
      {
        platform,
        channelId,
      }
    );
    return this.extractData(result);
  }

  async createChatChannel(channel: Partial<ChatChannel>): Promise<ChatChannel> {
    const result = await (window as any).__TAURI__.core.invoke("create_chat_channel", {
      data: channel,
    });
    return this.extractData(result);
  }

  async updateChatChannel(id: string, data: Partial<ChatChannel>): Promise<ChatChannel> {
    const result = await (window as any).__TAURI__.core.invoke("update_chat_channel", { id, data });
    return this.extractData(result);
  }

  async deleteChatChannel(id: string): Promise<void> {
    await (window as any).__TAURI__.core.invoke("delete_chat_channel", { id });
  }

  async getChatAccounts(filter?: any): Promise<ChatAccount[]> {
    const result = await (window as any).__TAURI__.core.invoke("get_chat_accounts", { filter });
    return this.extractData(result);
  }

  async getChatAccountByPlatformAndUser(
    platform: string,
    userId: string
  ): Promise<ChatAccount | null> {
    const result = await (window as any).__TAURI__.core.invoke(
      "get_chat_account_by_platform_and_user",
      {
        platform,
        userId,
      }
    );
    return this.extractData(result);
  }

  async getChatAccountsByPlatform(platform: string): Promise<ChatAccount[]> {
    const result = await (window as any).__TAURI__.core.invoke("get_chat_accounts_by_platform", {
      platform,
    });
    return this.extractData(result);
  }

  async createChatAccount(account: Partial<ChatAccount>): Promise<ChatAccount> {
    const result = await (window as any).__TAURI__.core.invoke("create_chat_account", {
      data: account,
    });
    return this.extractData(result);
  }

  async updateChatAccount(id: string, data: Partial<ChatAccount>): Promise<ChatAccount> {
    const result = await (window as any).__TAURI__.core.invoke("update_chat_account", { id, data });
    return this.extractData(result);
  }

  async deleteChatAccount(id: string): Promise<void> {
    await (window as any).__TAURI__.core.invoke("delete_chat_account", { id });
  }

  async getDashboardPreferences(userId: string): Promise<DashboardPreferences> {
    const result = await (window as any).__TAURI__.core.invoke("get_dashboard_preferences", {
      id: userId,
    });
    return this.extractData(result);
  }

  async getOrCreateDashboardPreferences(userId: string): Promise<DashboardPreferences> {
    const result = await (window as any).__TAURI__.core.invoke(
      "get_or_create_dashboard_preferences",
      { userId }
    );
    return this.extractData(result);
  }

  async updateDashboardPreferences(
    id: string,
    data: Partial<DashboardPreferences>
  ): Promise<DashboardPreferences> {
    const result = await (window as any).__TAURI__.core.invoke("patch_dashboard_preferences", {
      id,
      data,
    });
    return this.extractData(result);
  }

  async getCustomEmotes(platform: string, channelId?: string): Promise<CustomEmote[]> {
    const result = await (window as any).__TAURI__.core.invoke("get_custom_emotes_by_platform", {
      platform,
      channelId,
    });
    return this.extractData(result);
  }

  async createCustomEmote(emote: Partial<CustomEmote>): Promise<CustomEmote> {
    const result = await (window as any).__TAURI__.core.invoke("create_custom_emote", {
      data: emote,
    });
    return this.extractData(result);
  }

  async updateCustomEmote(id: string, data: Partial<CustomEmote>): Promise<CustomEmote> {
    const result = await (window as any).__TAURI__.core.invoke("update_custom_emote", { id, data });
    return this.extractData(result);
  }

  async deleteCustomEmote(id: string): Promise<void> {
    await (window as any).__TAURI__.core.invoke("delete_custom_emote", { id });
  }

  private extractData<T>(result: any): T {
    if (result && result.data) {
      return result.data;
    }
    return result;
  }
}
