import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { getLoggingService } from "@tauri-apps/logger";
import { DEFAULT_TIMEOUT_MS } from "@shared/utils/constants";

export interface InvokeOptions {
  timeoutMs?: number;
  suppressError?: boolean;
}

interface TauriResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
}

@Injectable({ providedIn: "root" })
export class TauriApiService {
  private readonly logger = getLoggingService();

  async invoke<T>(
    command: string,
    args?: Record<string, unknown>,
    options: InvokeOptions = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const response = await Promise.race([
        invoke<TauriResponse<T>>(command, args),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Command "${command}" timed out after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]);
      if (response.status === "success") {
        return response.data as T;
      } else {
        throw new Error(response.message || `Operation failed: ${command}`);
      }
    } catch (error: unknown) {
      if (!options.suppressError) {
        this.logger.error(`Error invoking command "${command}":`, error, {
          source: "TauriApiService",
        });
      }
      throw error;
    }
  }

  async kickSendChatMessage(args: {
    content: string;
    accessToken: string;
    broadcasterUserId: number;
    replyToMessageId: null;
  }): Promise<boolean> {
    return this.invoke<boolean>("kickSendChatMessage", args);
  }

  async kickFetchUserInfo(args: { username: string }) {
    return this.invoke("kickFetchUserInfo", args);
  }

  async kickFetchChannelEmotes(args: { channelSlug: string }) {
    return this.invoke("kickFetchChannelEmotes", args);
  }

  async kickDeleteChatMessage(args: { messageId: string; accessToken: string }): Promise<boolean> {
    return this.invoke<boolean>("kickDeleteChatMessage", args);
  }

  async kickFetchChatroomId(args: { channelSlug: string; accessToken: string | null }) {
    return this.invoke("kickFetchChatroomId", args);
  }

  async kickFetchChannelInfo(args: { channelSlug: string }) {
    return this.invoke("kickFetchChannelInfo", args);
  }

  async twitchDeleteMessage(args: {
    channelId: string;
    messageId: string;
    accessToken: string;
  }): Promise<boolean> {
    return this.invoke<boolean>("twitchDeleteMessage", args);
  }

  async twitchFetchChannelEmotes(args: { roomId: string }) {
    return this.invoke("twitchFetchChannelEmotes", args);
  }

  async twitchFetchGlobalIcons() {
    return this.invoke("twitchFetchGlobalIcons");
  }

  async twitchFetchChannelIcons(args: { roomId: string }) {
    return this.invoke("twitchFetchChannelIcons", args);
  }

  async youtubeFetchLiveChatId(args: { videoId: string; accessToken: string }): Promise<string> {
    return this.invoke<string>("youtubeFetchLiveChatId", args);
  }

  async youtubeSendMessage(args: {
    liveChatId: string;
    messageText: string;
    accessToken: string;
  }): Promise<string> {
    return this.invoke<string>("youtubeSendMessage", args);
  }

  async youtubeDeleteMessage(args: { messageId: string; accessToken: string }): Promise<string> {
    return this.invoke<string>("youtubeDeleteMessage", args);
  }

  async youtubeFetchLiveVideoId(args: {
    channelName: string;
    accessToken: string;
  }): Promise<string> {
    return this.invoke<string>("youtubeFetchLiveVideoId", args);
  }

  async youtubeFetchLiveVideoIdByApiKey(args: {
    channelName: string;
    apiKey: string;
  }): Promise<string> {
    return this.invoke<string>("youtubeFetchLiveVideoIdByApiKey", args);
  }

  async youtubeFetchChatMessages(args: {
    videoId: string;
    pageToken?: string;
    apiKey?: string;
  }): Promise<string> {
    return this.invoke<string>("youtubeFetchChatMessages", args);
  }

  async youtubeFetchChannelInfoByApiKey(args: { channel_name: string; api_key: string }) {
    return this.invoke("youtubeFetchChannelInfoByApiKey", args);
  }

  async authValidate(args: { platform: string }) {
    return this.invoke("authValidate", args);
  }

  async authRefresh(args: { platform: string; accountId: string }) {
    return this.invoke("authRefresh", args);
  }

  async authStart(args: { platform: string }) {
    return this.invoke("authStart", args);
  }

  async authAwaitCallback(args: { platform: string }) {
    return this.invoke("authAwaitCallback", args);
  }

  async authComplete(args: { platform: string; callbackUrl: string }) {
    return this.invoke("authComplete", args);
  }

  async authDisconnect(args: { platform: string; accountId: string }) {
    return this.invoke("authDisconnect", args);
  }

  async authStatus(args: { platform: string }) {
    return this.invoke("authStatus", args);
  }

  async getCurrentVersion(): Promise<string> {
    return this.invoke<string>("getCurrentVersion");
  }

  async checkForUpdate() {
    return this.invoke("checkForUpdate");
  }

  async downloadUpdate(args: { url: string }): Promise<string> {
    return this.invoke<string>("downloadUpdate", args);
  }

  async installUpdate(args: { installerPath: string }): Promise<boolean> {
    return this.invoke<boolean>("installUpdate", args);
  }
}
