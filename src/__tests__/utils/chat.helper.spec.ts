import { describe, it, expect, vi, beforeEach } from "vitest";

/* Mock @tauri-apps/api/core */
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

/* Mock @services/core/platform-resolver.service */
vi.mock("@services/core/platform-resolver.service", () => ({
  PlatformResolverService: vi.fn().mockImplementation(() => ({
    getDisplayName: vi.fn((platform: string) => platform),
    getBadgeClasses: vi.fn(() => ""),
    getMixedFilterBadgeClasses: vi.fn(() => ""),
    getStatusClasses: vi.fn(() => ""),
    getStatusLabel: vi.fn(() => ""),
  })),
}));

/* Mock @utils/youtube-url-parser.util */
vi.mock("@utils/youtube-url-parser.util", () => ({
  extractYoutubeVideoId: vi.fn(),
}));

// Import after mocks are set up
import {
  generateTimestamp,
  isSafeRemoteImageUrl,
  createChatMessage,
  getPlatformLabel,
  getDensityCardClasses,
  getDensityTextClasses,
  buildOverlayUrl,
  createMessageActionState,
} from "../../app/shared/utils/chat.helper";
import { sortBy, groupByField } from "@tauri-front/shared";

import {
  ChatMessage,
  PlatformType,
  DensityMode,
  MessageActionKind,
  MessageActionStatus,
} from "../../app/entities/chat.model";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const base: ChatMessage = {
    id: "msg-1",
    platform: "twitch",
    sourceMessageId: "src-1",
    sourceChannelId: "channel-1",
    sourceUserId: "user-1",
    author: "TestUser",
    text: "Hello",
    timestamp: "2024-01-01T12:00:00.000Z",
    badges: [],
    isSupporter: false,
    isOutgoing: false,
    isDeleted: false,
    canRenderInOverlay: true,
    replyToMessageId: undefined,
    actions: {
      reply: { kind: "reply", status: "available" },
      delete: { kind: "delete", status: "available" },
    },
    rawPayload: {
      providerEvent: "privmsg",
      providerChannelId: "channel-1",
      providerUserId: "user-1",
      preview: "Hello",
    },
  };
  return { ...base, ...overrides };
}

describe("chat.helper", () => {
  describe("generateTimestamp()", () => {
    it("returns a valid ISO 8601 timestamp string", () => {
      const result = generateTimestamp();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("returns the current date/time", () => {
      const before = Date.now();
      const result = generateTimestamp();
      const after = Date.now();
      const parsed = new Date(result).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });
  });

  describe("sortMessagesByRecency()", () => {
    it("sorts messages by timestamp descending (most recent first)", () => {
      const messages: ChatMessage[] = [
        makeMessage({ id: "a", timestamp: "2024-01-01T10:00:00.000Z" }),
        makeMessage({ id: "b", timestamp: "2024-01-01T12:00:00.000Z" }),
        makeMessage({ id: "c", timestamp: "2024-01-01T11:00:00.000Z" }),
      ];

      const result = sortBy(messages, "timestamp", "desc");

      expect(result[0].id).toBe("b");
      expect(result[1].id).toBe("c");
      expect(result[2].id).toBe("a");
    });

    it("does not mutate the original array", () => {
      const messages: ChatMessage[] = [
        makeMessage({ id: "a", timestamp: "2024-01-01T10:00:00.000Z" }),
        makeMessage({ id: "b", timestamp: "2024-01-01T12:00:00.000Z" }),
      ];
      const originalFirst = messages[0].id;

      sortBy(messages, "timestamp", "desc");

      expect(messages[0].id).toBe(originalFirst);
    });

    it("handles a single message", () => {
      const messages = [makeMessage({ id: "only" })];
      const result = sortBy(messages, "timestamp", "desc");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("only");
    });

    it("handles an empty array", () => {
      const result = sortBy([] as ChatMessage[], "timestamp", "desc");
      expect(result).toHaveLength(0);
    });
  });

  describe("sortMessagesChronological()", () => {
    it("sorts messages by timestamp ascending (oldest first)", () => {
      const messages: ChatMessage[] = [
        makeMessage({ id: "a", timestamp: "2024-01-01T12:00:00.000Z" }),
        makeMessage({ id: "b", timestamp: "2024-01-01T10:00:00.000Z" }),
        makeMessage({ id: "c", timestamp: "2024-01-01T11:00:00.000Z" }),
      ];

      const result = sortBy(messages, "timestamp", "asc");

      expect(result[0].id).toBe("b");
      expect(result[1].id).toBe("c");
      expect(result[2].id).toBe("a");
    });

    it("does not mutate the original array", () => {
      const messages: ChatMessage[] = [
        makeMessage({ id: "a", timestamp: "2024-01-01T10:00:00.000Z" }),
        makeMessage({ id: "b", timestamp: "2024-01-01T12:00:00.000Z" }),
      ];
      const originalFirst = messages[0].id;

      sortBy(messages, "timestamp", "asc");

      expect(messages[0].id).toBe(originalFirst);
    });
  });

  describe("isSafeRemoteImageUrl()", () => {
    it("returns true for https:// URLs", () => {
      expect(isSafeRemoteImageUrl("https://example.com/image.png")).toBe(true);
    });

    it("returns true for http:// URLs", () => {
      expect(isSafeRemoteImageUrl("http://example.com/image.png")).toBe(true);
    });

    it("returns false for app-relative URLs (no protocol)", () => {
      expect(isSafeRemoteImageUrl("/557341058")).toBe(false);
      expect(isSafeRemoteImageUrl("assets/emote.png")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isSafeRemoteImageUrl(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isSafeRemoteImageUrl(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isSafeRemoteImageUrl("")).toBe(false);
    });

    it("returns false for whitespace-only string", () => {
      expect(isSafeRemoteImageUrl("   ")).toBe(false);
    });

    it("trims whitespace before checking", () => {
      expect(isSafeRemoteImageUrl("  https://example.com/image.png  ")).toBe(true);
    });
  });

  describe("groupByPlatform()", () => {
    it("groups items by platform type", () => {
      const items = [
        { platform: "twitch" as PlatformType, name: "msg1" },
        { platform: "kick" as PlatformType, name: "msg2" },
        { platform: "youtube" as PlatformType, name: "msg3" },
        { platform: "twitch" as PlatformType, name: "msg4" },
      ];

      const result = groupByField(items, "platform") as Record<PlatformType, typeof items>;

      expect(result["twitch"]).toHaveLength(2);
      expect(result["kick"]).toHaveLength(1);
      expect(result["youtube"]).toHaveLength(1);
      expect(result["twitch"][0].name).toBe("msg1");
      expect(result["twitch"][1].name).toBe("msg4");
    });

    it("returns empty arrays when no items match a platform", () => {
      const items = [{ platform: "twitch" as PlatformType, name: "msg1" }];

      const result = groupByField(items, "platform") as Record<PlatformType, typeof items>;

      expect(result["twitch"]).toHaveLength(1);
      expect(result["kick"]).toHaveLength(0);
      expect(result["youtube"]).toHaveLength(0);
    });

    it("handles empty array input", () => {
      const result = groupByField(
        [] as { platform: PlatformType; name: string }[],
        "platform"
      ) as Record<PlatformType, { platform: PlatformType; name: string }[]>;
      expect(result["twitch"]).toHaveLength(0);
      expect(result["kick"]).toHaveLength(0);
      expect(result["youtube"]).toHaveLength(0);
    });
  });

  describe("createChatMessage()", () => {
    it("creates a ChatMessage with required fields", () => {
      const result = createChatMessage("twitch", "channel-123");

      expect(result.id).toBeDefined();
      expect(result.platform).toBe("twitch");
      expect(result.sourceChannelId).toBe("channel-123");
      expect(result.sourceMessageId).toBe(result.id);
      expect(result.sourceUserId).toContain("twitch-user-");
      expect(result.author).toBe("Anonymous");
      expect(result.text).toBe("");
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.badges).toEqual([]);
      expect(result.isSupporter).toBe(false);
      expect(result.isOutgoing).toBe(false);
      expect(result.isDeleted).toBe(false);
      expect(result.canRenderInOverlay).toBe(true);
    });

    it("uses custom options when provided", () => {
      const result = createChatMessage("kick", "kick-channel", {
        id: "custom-id",
        sourceMessageId: "custom-src",
        sourceUserId: "custom-user",
        author: "CustomAuthor",
        text: "Hello world",
        badges: ["subscriber", "moderator"],
        isSupporter: true,
        isOutgoing: true,
        replyToMessageId: "reply-to",
      });

      expect(result.id).toBe("custom-id");
      expect(result.sourceMessageId).toBe("custom-src");
      expect(result.sourceUserId).toBe("custom-user");
      expect(result.author).toBe("CustomAuthor");
      expect(result.text).toBe("Hello world");
      expect(result.badges).toEqual(["subscriber", "moderator"]);
      expect(result.isSupporter).toBe(true);
      expect(result.isOutgoing).toBe(true);
      expect(result.replyToMessageId).toBe("reply-to");
    });

    it("sets correct provider event name per platform", () => {
      const twitch = createChatMessage("twitch", "ch");
      expect(twitch.rawPayload.providerEvent).toBe("privmsg");

      const kick = createChatMessage("kick", "ch");
      expect(kick.rawPayload.providerEvent).toBe("chat.message");

      const youtube = createChatMessage("youtube", "ch");
      expect(youtube.rawPayload.providerEvent).toBe("liveChatMessage");
    });

    it("sets rawPayload.providerChannelId from channelId", () => {
      const result = createChatMessage("twitch", "my-channel-id");
      expect(result.rawPayload.providerChannelId).toBe("my-channel-id");
    });

    it("sets rawPayload.providerUserId from sourceUserId", () => {
      const result = createChatMessage("twitch", "ch", {
        sourceUserId: "my-user-id",
      });
      expect(result.rawPayload.providerUserId).toBe("my-user-id");
    });

    it("sets rawPayload.preview from text", () => {
      const result = createChatMessage("twitch", "ch", {
        text: "Preview text",
      });
      expect(result.rawPayload.preview).toBe("Preview text");
    });

    it("includes default actions (reply and delete)", () => {
      const result = createChatMessage("twitch", "ch");

      expect(result.actions.reply.kind).toBe("reply");
      expect(result.actions.reply.status).toBe("available");
      expect(result.actions.delete.kind).toBe("delete");
      expect(result.actions.delete.status).toBe("available");
    });

    it("allows customActions to override defaults", () => {
      const result = createChatMessage("twitch", "ch", {
        customActions: {
          reply: { kind: "reply", status: "disabled", reason: "no permission" },
        },
      });

      expect(result.actions.reply.status).toBe("disabled");
      expect(result.actions.reply.reason).toBe("no permission");
      expect(result.actions.delete.status).toBe("available");
    });

    it("supports rawPayloadOverride", () => {
      const result = createChatMessage("twitch", "ch", {
        rawPayloadOverride: {
          providerEvent: "custom-event",
          preview: "custom preview",
        },
      });

      expect(result.rawPayload.providerEvent).toBe("custom-event");
      expect(result.rawPayload.preview).toBe("custom preview");
    });
  });

  describe("getPlatformLabel()", () => {
    it("returns the platform name string from the resolver", () => {
      const result = getPlatformLabel("twitch");
      expect(result).toBe("twitch");
    });
  });

  describe("getDensityCardClasses()", () => {
    it('returns "gap-3 rounded-[1.25rem] p-3" for compact mode', () => {
      const result = getDensityCardClasses("compact");
      expect(result).toBe("gap-3 rounded-[1.25rem] p-3");
    });

    it('returns "gap-4 rounded-[1.5rem] p-4" for comfortable mode', () => {
      const result = getDensityCardClasses("comfortable");
      expect(result).toBe("gap-4 rounded-[1.5rem] p-4");
    });
  });

  describe("getDensityTextClasses()", () => {
    it('returns "text-xs leading-5" for compact mode', () => {
      const result = getDensityTextClasses("compact");
      expect(result).toBe("text-xs leading-5");
    });

    it('returns "text-sm leading-6" for comfortable mode', () => {
      const result = getDensityTextClasses("comfortable");
      expect(result).toBe("text-sm leading-6");
    });
  });

  describe("buildOverlayUrl()", () => {
    it("builds correct URL with port and encoded widgetId", () => {
      const result = buildOverlayUrl(8080, "my-widget-123");
      expect(result).toBe("http://127.0.0.1:8080/overlay?widgetId=my-widget-123");
    });

    it("encodes special characters in widgetId", () => {
      const result = buildOverlayUrl(9000, "widget with spaces & symbols");
      expect(result).toContain(encodeURIComponent("widget with spaces & symbols"));
      expect(result).toBe(
        `http://127.0.0.1:9000/overlay?widgetId=${encodeURIComponent(
          "widget with spaces & symbols"
        )}`
      );
    });

    it("handles numeric widgetId", () => {
      const result = buildOverlayUrl(3000, "12345");
      expect(result).toBe("http://127.0.0.1:3000/overlay?widgetId=12345");
    });
  });

  describe("createMessageActionState()", () => {
    it("creates a MessageAction with kind and status", () => {
      const result = createMessageActionState("reply", "available");

      expect(result.kind).toBe("reply");
      expect(result.status).toBe("available");
      expect(result.reason).toBeUndefined();
    });

    it("creates a MessageAction with optional reason", () => {
      const result = createMessageActionState("delete", "failed", "user not authorized");

      expect(result.kind).toBe("delete");
      expect(result.status).toBe("failed");
      expect(result.reason).toBe("user not authorized");
    });

    it("returns correct shape for reply action", () => {
      const result = createMessageActionState("reply", "pending");
      const expected = {
        kind: "reply" as MessageActionKind,
        status: "pending" as MessageActionStatus,
      };
      expect(result).toMatchObject(expected);
    });
  });
});
