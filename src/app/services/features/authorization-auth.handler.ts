import { inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PlatformType, ChatAccount, AuthStatus } from "@models/chat.model";
import { LoggerService } from "@services/core/logger.service";

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
  private readonly logger = inject(LoggerService);

  async startAuthorization(platform: PlatformType): Promise<AuthCommandResultPayload> {
    const result = await invoke<AuthCommandResultPayload>("authStart", { platform });
    if (result.authUrl) {
      const isDeepLink = result.authUrl.includes("unichat://");
      await openUrl(result.authUrl);

      if (isDeepLink) {
        this.logger.info("AuthorizationService", "Started deep-link OAuth flow for", platform);
        return result;
      } else {
        const completed = await invoke<AuthCommandResultPayload>("authAwaitCallback", { platform });
        return completed;
      }
    }
    return result;
  }

  async completeAuthorization(
    platform: PlatformType,
    callbackUrl: string
  ): Promise<AuthCommandResultPayload> {
    const result = await invoke<AuthCommandResultPayload>("authComplete", {
      platform,
      callbackUrl,
    });
    return result;
  }

  async disconnect(platform: PlatformType, accountId: string): Promise<AuthCommandResultPayload> {
    const result = await invoke<AuthCommandResultPayload>("authDisconnect", {
      platform,
      accountId,
    });
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
