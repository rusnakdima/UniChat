export type ThemeMode = "light" | "dark";

export type PlatformType = "twitch" | "kick" | "youtube";

export type ConnectionMode = "account" | "channelWatch";

export type PlatformStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export type FeedMode = "mixed" | "split";

export type DensityMode = "compact" | "comfortable";

export type WidgetStatus = "live" | "draft";

export type WidgetFilter = "all" | "supporters";

export type OverlayAnimationType = "none" | "fade" | "slide" | "pop";

export type OverlayDirection = "top" | "bottom" | "left" | "right";

export type MessageType = "returning" | "highlighted" | "regular";

export type MessageActionKind = "reply" | "delete";

export type MessageActionStatus = "available" | "disabled" | "pending" | "failed";

export type AuthStatus = "unauthorized" | "authorized" | "tokenExpired" | "revoked";

export interface MessageAction {
  kind: MessageActionKind;
  status: MessageActionStatus;
  reason?: string;
}

export interface PlatformCapabilities {
  canListen: boolean;
  canReply: boolean;
  canDelete: boolean;
}

export type ModerationRole = "viewer" | "owner" | "moderator";

export interface ChannelAccountCapabilities extends PlatformCapabilities {
  canModerate: boolean;
  moderationRole: ModerationRole;
  verified: boolean;
}

export interface PlatformSession {
  platform: PlatformType;
  label: string;
  status: PlatformStatus;
  connectionMode: ConnectionMode;
  target: string;
  accountLabel?: string;
  summary: string;
  latencyMs: number;
  viewers: number;
  capabilities: PlatformCapabilities;
}

export interface ConnectionState extends PlatformSession {}

export interface RawPayloadMetadata {
  providerEvent: string;
  providerChannelId: string;
  providerUserId: string;
  preview: string;
  emotes?: ChatMessageEmote[];
  badgeIcons?: ChatBadgeIcon[];
}

export interface ChatMessageEmote {
  provider: "twitch" | "7tv" | "kick" | "custom";
  id: string;
  code: string;
  start: number;
  end: number;
  url: string;
}

export interface ChatBadgeIcon {
  id: string;
  label: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  platform: PlatformType;
  sourceMessageId: string;
  sourceChannelId: string;
  sourceUserId: string;
  author: string;
  text: string;
  timestamp: string;
  badges: string[];
  isSupporter: boolean;
  isOutgoing: boolean;
  isDeleted: boolean;
  canRenderInOverlay: boolean;
  replyToMessageId?: string;
  actions: Record<MessageActionKind, MessageAction>;
  rawPayload: RawPayloadMetadata;
  authorAvatarUrl?: string;
  channelImageUrl?: string;
  messageType?: MessageType;
  messageTypeReason?: string;
  /** Sequence number for detecting message gaps during reconnection */
  sequenceNumber?: number;
  /** Timestamp when message was received (for gap detection) */
  receivedAt?: number;
}

export interface SplitLayout {
  orderedPlatforms: PlatformType[];
  hiddenPlatforms: PlatformType[];
  columnWidths: Record<PlatformType, number>;
  /** Per-platform order of provider channel ids for split channel switcher */
  orderedChannelIds?: Partial<Record<PlatformType, string[]>>;
  /** Layout orientation for split feed: row (horizontal) or column (vertical) */
  orientation?: "row" | "column";
  /** Per-platform channel ids enabled for split feed; empty = all enabled */
  splitEnabledChannelIds?: Partial<Record<PlatformType, string[]>>;
}

export interface DashboardPreferences {
  feedMode: FeedMode;
  densityMode: DensityMode;
  splitLayout: SplitLayout;
  /** Canonical channel refs (`platform:providerChannelId`) enabled in mixed feed; empty = none enabled */
  mixedEnabledChannelIds: string[];
}

export interface WidgetConfig {
  id: string;
  name: string;
  status: WidgetStatus;
  filter: WidgetFilter;
  sceneHint: string;
  themeHint: string;
  port: number;
  channelIds?: string[]; // Canonical channel refs (`platform:providerChannelId`) to include in overlay

  // Overlay appearance settings
  customCss?: string; // Custom CSS styles
  textSize?: number; // Font size in pixels
  animationType?: OverlayAnimationType; // Animation style
  animationDirection?: OverlayDirection; // Animation entrance direction
  maxMessages?: number; // Maximum messages to display
  transparentBg?: boolean; // Enable transparent background
}

export interface DashboardStats {
  activePlatforms: number;
  manageablePlatforms: number;
  liveWidgets: number;
  supporterMessages: number;
  totalMessages: number;
  primaryOverlayUrl: string;
}

export interface ChatAccount {
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

export interface ChatChannel {
  id: string;
  platform: PlatformType;
  channelId: string;
  channelName: string;
  channelImageUrl?: string;
  isAuthorized: boolean;
  accountId?: string;
  accountCapabilities?: ChannelAccountCapabilities;
  isVisible: boolean;
  addedAt: string;
}

export interface ChannelConnectionError {
  code: string;
  message: string;
  occurredAt: string;
  isRecoverable: boolean;
}

export interface RoomState {
  isSlowMode: boolean;
  slowModeWaitTime?: number; // seconds between messages
  isFollowersOnly: boolean;
  followersOnlyMinutes?: number; // minutes required to follow
  isSubscribersOnly: boolean;
  isEmotesOnly: boolean;
  isR9k: boolean; // unique messages only
}

export interface ChannelConnection {
  channelId: string;
  platform: PlatformType;
  status: PlatformStatus;
  latencyMs: number;
  viewers: number;
  capabilities: PlatformCapabilities;
  error?: ChannelConnectionError;
  roomState?: RoomState;
}

export interface AuthorizationState {
  twitch: AuthStatus;
  kick: AuthStatus;
  youtube: AuthStatus;
}

export interface UserProfileState {
  loading: boolean;
  hasMoreMessages: boolean;
  loadedMessageCount: number;
  lastLoadedTimestamp?: string;
}

export interface ChatHistoryLoadState {
  loaded: boolean;
  hasMore: boolean;
  oldestMessageTimestamp?: string;
}
