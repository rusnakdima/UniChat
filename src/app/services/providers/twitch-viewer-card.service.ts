/* sys lib */
import { Injectable } from "@angular/core";

/* models */
import { ChatBadgeIcon } from "@models/chat.model";

export interface TwitchUserInfo {
  id: string;
  login: string;
  display_name: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  banner?: string | null;
  created_at: string;
}

export type TwitchViewerCardUser = TwitchUserInfo & {
  chatColor?: string;
  badges?: ChatBadgeIcon[];
};

/**
 * Interface for Twitch GraphQL ViewerCard response
 */
interface TwitchGraphQLViewerCard {
  data?: {
    user?: {
      id?: string;
      login?: string;
      displayName?: string;
      description?: string;
      profileImageURL?: string;
      offlineImageUrl?: string;
      createdAt?: string;
      chatColor?: string;
      roles?: {
        isAffiliate?: boolean;
        isPartner?: boolean;
        isStaff?: boolean;
        isAdmin?: boolean;
        isGlobalMod?: boolean;
      };
      badges?: Array<{
        id?: string;
        title?: string;
        image?: {
          url_1x?: string;
          url_2x?: string;
          url_4x?: string;
        };
      }>;
      chatRoomRules?: string[];
      primaryColorHex?: string;
      follow?: {
        followedAt?: string;
      };
      stream?: {
        id?: string;
        previewImage?: {
          url?: string;
        };
      };
      panels?: {
        id?: string;
        data?: {
          title?: string;
          description?: string;
          image?: {
            url?: string;
          };
          link?: {
            url?: string;
          };
        };
      }[];
      videos?: {
        edges?: Array<{
          node?: {
            id?: string;
            title?: string;
            previewURL?: string;
            viewCount?: number;
            createdAt?: string;
          };
        }>;
      };
      clips?: {
        edges?: Array<{
          node?: {
            id?: string;
            title?: string;
            thumbnailURL?: string;
            viewCount?: number;
            createdAt?: string;
          };
        }>;
      };
      channel?: {
        id?: string;
      };
    };
  };
  errors?: Array<{
    message?: string;
  }>;
}

@Injectable({
  providedIn: "root",
})
export class TwitchViewerCardService {
  /**
   * Fetch Twitch user viewer card from GraphQL API
   * This is the same API Twitch's frontend uses - no auth required for public data
   * @param channelLogin - The channel login name (e.g., "milanrodd")
   * @param targetLogin - The target user login name (e.g., "radio86pk")
   * @returns User info from GraphQL API
   */
  async fetchTwitchViewerCard(
    channelLogin: string,
    targetLogin: string
  ): Promise<TwitchViewerCardUser | null> {
    const url = "https://gql.twitch.tv/gql";

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
        },
        body: JSON.stringify([
          {
            operationName: "ViewerCard",
            variables: {
              channelID: "",
              channelIDStr: "",
              channelLogin: channelLogin.toLowerCase(),
              targetLogin: targetLogin.toLowerCase(),
              isViewerBadgeCollectionEnabled: true,
            },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash: "c02d0aa3e6fdaad9a668f354236e0ded00e338cb742da33bb166e0f34ebf3c3b",
              },
            },
          },
        ]),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as TwitchGraphQLViewerCard[];
      const result = data[0];

      if (!result?.data?.user) {
        return null;
      }

      const user = result.data.user;

      const badges: ChatBadgeIcon[] = [];
      if (user.badges) {
        for (const badge of user.badges) {
          if (badge.id && badge.title && badge.image?.url_1x) {
            badges.push({
              id: badge.id,
              label: badge.title,
              url: badge.image.url_1x,
            });
          }
        }
      }

      return {
        id: user.id ?? "",
        login: user.login ?? targetLogin.toLowerCase(),
        display_name: user.displayName ?? targetLogin,
        description: user.description ?? "",
        profile_image_url: user.profileImageURL ?? "",
        offline_image_url: user.offlineImageUrl ?? "",
        banner: user.primaryColorHex ?? null,
        created_at: user.createdAt ?? "",
        chatColor: user.chatColor,
        badges,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch Twitch user info (no API call - returns basic info only)
   * @param username - Twitch username
   * @returns Basic user info with generated profile URL
   */
  async fetchUserInfo(username: string): Promise<TwitchUserInfo | null> {
    const viewerCard = await this.fetchTwitchViewerCard(username, username);
    if (viewerCard) {
      return viewerCard;
    }

    return {
      id: "",
      login: username.toLowerCase(),
      display_name: username,
      description: "",
      profile_image_url: "",
      offline_image_url: "",
      banner: null,
      created_at: "",
    };
  }

  /**
   * Fetch Twitch user profile image from Twitch CDN (public, no auth required)
   */
  async fetchUserProfileImage(username: string): Promise<string | null> {
    try {
      const info =
        (await this.fetchTwitchViewerCard(username, username)) ??
        (await this.fetchUserInfo(username));
      return info?.profile_image_url?.trim() ? info.profile_image_url : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch channel profile image from Twitch CDN (no auth required)
   */
  async fetchChannelProfileImage(channelLogin: string): Promise<string | null> {
    const info = await this.fetchUserInfo(channelLogin);
    return info?.profile_image_url?.trim() ? info.profile_image_url : null;
  }
}
