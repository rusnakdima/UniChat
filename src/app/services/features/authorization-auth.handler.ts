import { inject } from "@angular/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PlatformType, ChatAccount, AuthStatus } from "@models/chat.model";
import { LOGGER_SERVICE } from "@services/core/logger.service";
import { TauriApiService } from "@app/api/tauri-api.service";

interface AuthAccountPayload {
  id: string;
  platform: PlatformType;
  username: string;
  userId: string;
  avatarUrl?: string;
  authStatus: AuthStatus;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  authorizedAt: string;
}

interface AuthCommandResultPayload {
  success: boolean;
  message: string;
  authUrl?: string;
  account?: AuthAccountPayload;
  accounts?: AuthAccountPayload[];
}

export class AuthorizationAuthHandler {
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly tauriApi = inject(TauriApiService);

  async startAuthorization(platform: PlatformType): Promise<AuthCommandResultPayload> {
    const result = await this.tauriApi.authStart({ platform }) as AuthCommandResultPayload;
    if (result.authUrl) {
      const isDeepLink = result.authUrl.includes("unichat://");
      await openUrl(result.authUrl);

      if (isDeepLink) {
        this.logger.info("Started deep-link OAuth flow for", { source: "AuthorizationService", platform });
        return result;
      } else {
        const completed = await this.tauriApi.authAwaitCallback({ platform }) as AuthCommandResultPayload;
        return completed;
      }
    }
    return result;
  }

  async completeAuthorization(
    platform: PlatformType,
    callbackUrl: string
  ): Promise<AuthCommandResultPayload> {
    const result = await this.tauriApi.authComplete({
      platform,
      callbackUrl,
    }) as AuthCommandResultPayload;
    return result;
  }

  async disconnect(platform: PlatformType, accountId: string): Promise<AuthCommandResultPayload> {
    const result = await this.tauriApi.authDisconnect({
      platform,
      accountId,
    }) as AuthCommandResultPayload;
    return result;
  }

  async updateKickUsernameFromChannel(accountId: string, channelName: string): Promise<void> {
    try {
      const response = await fetch(`https://kick.com/api/v1/channels/${channelName}`);
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const kickData = data as {
        user?: { username?: string; id?: number };
        username?: string;
        id?: number;
      };
      const username = kickData.user?.username || kickData.username;
      const userId = String(kickData.user?.id || kickData.id || "");

      if (username && userId) {
        this.onUsernameUpdate?.(accountId, username, userId);
      }
    } catch {
      // Silently fail
    }
  }

  onUsernameUpdate?: (accountId: string, username: string, userId: string) => void;
}