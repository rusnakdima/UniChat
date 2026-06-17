import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { LOGGER_SERVICE } from "@services/core/logger.service";
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
  private readonly logger = inject(LOGGER_SERVICE);

  async invoke<T>(
    command: string,
    args?: Record<string, unknown>,
    options: InvokeOptions = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const response = await Promise.race([
        invoke<{ Err?: string } | T>(command, args),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Command "${command}" timed out after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]);

      if (typeof response === "object" && response !== null && "Err" in response) {
        throw new Error((response as { Err: string }).Err);
      }

      return response as T;
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
    return this.invoke<boolean>("kick_send_chat_message", args);
  }

  async kickFetchUserInfo(args: { username: string }) {
    return this.invoke("kick_fetch_user_info", args);
  }

  async kickFetchChannelEmotes(args: { channelSlug: string }) {
    return this.invoke("kick_fetch_channel_emotes", args);
  }

  async kickDeleteChatMessage(args: { messageId: string; accessToken: string }): Promise<boolean> {
    return this.invoke<boolean>("kick_delete_chat_message", args);
  }

  async kickFetchChatroomId(args: { channelSlug: string; accessToken: string | null }) {
    return this.invoke("kick_fetch_chatroom_id", args);
  }

  async kickFetchChannelInfo(args: { channelSlug: string }) {
    return this.invoke("kick_fetch_channel_info", args);
  }

  async twitchDeleteMessage(args: {
    channelId: string;
    messageId: string;
    accessToken: string;
  }): Promise<boolean> {
    return this.invoke<boolean>("twitch_delete_message", args);
  }

  async twitchFetchChannelEmotes(args: { roomId: string }) {
    return this.invoke("twitch_fetch_channel_emotes", args);
  }

  async twitchFetchGlobalIcons() {
    return this.invoke("twitch_fetch_global_icons");
  }

  async twitchFetchChannelIcons(args: { roomId: string }) {
    return this.invoke("twitch_fetch_channel_icons", args);
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
    return this.invoke<string>("youtube_fetch_live_video_id_by_api_key", args);
  }

  async youtubeFetchChatMessages(args: {
    videoId: string;
    pageToken?: string;
    apiKey?: string;
  }): Promise<string> {
    return this.invoke<string>("youtube_fetch_chat_messages", args);
  }

  async youtubeFetchChannelInfoByApiKey(args: { channel_name: string; api_key: string }) {
    return this.invoke("youtube_fetch_channel_info_by_api_key", args);
  }

  async authValidate(args: { platform: string }) {
    return this.invoke("auth_validate", args);
  }

  async authRefresh(args: { platform: string; accountId: string }) {
    return this.invoke("auth_refresh", args);
  }

  async authStart(args: { platform: string }) {
    return this.invoke("auth_start", args);
  }

  async authAwaitCallback(args: { platform: string }) {
    return this.invoke("auth_await_callback", args);
  }

  async authComplete(args: { platform: string; callbackUrl: string }) {
    return this.invoke("auth_complete", args);
  }

  async authDisconnect(args: { platform: string; accountId: string }) {
    return this.invoke("auth_disconnect", args);
  }

  async authStatus(args: { platform: string }) {
    return this.invoke("auth_status", args);
  }

  async getCurrentVersion(): Promise<string> {
    return this.invoke<string>("get_current_version");
  }

  async checkForUpdate() {
    return this.invoke("check_for_update");
  }

  async downloadUpdate(args: { url: string }): Promise<string> {
    return this.invoke<string>("download_update", args);
  }

  async installUpdate(args: { installerPath: string }): Promise<boolean> {
    return this.invoke<boolean>("install_update", args);
  }
}
