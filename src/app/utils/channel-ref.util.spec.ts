import { describe, it, expect } from "vitest";
import {
  buildChannelRef,
  parseChannelRef,
  findChannelByRef,
  toChannelRef,
  type ChannelRef,
} from "./channel-ref.util";

describe("ChannelRef Utilities", () => {
  describe("buildChannelRef", () => {
    it("should build a channel ref string with platform and channelId", () => {
      const ref = buildChannelRef("twitch", "123456");
      expect(ref).toBe("twitch:123456");
    });

    it("should handle different platforms", () => {
      expect(buildChannelRef("youtube", "abc123")).toBe("youtube:abc123");
      expect(buildChannelRef("kick", "xyz789")).toBe("kick:xyz789");
    });
  });

  describe("parseChannelRef", () => {
    it("should parse a valid channel ref string", () => {
      const result = parseChannelRef("twitch:123456");
      expect(result).toEqual({
        platform: "twitch",
        channelId: "123456",
        username: "123456",
      });
    });

    it("should return null for invalid ref without separator", () => {
      expect(parseChannelRef("invalidref")).toBeNull();
    });

    it("should return null for empty platform", () => {
      expect(parseChannelRef(":123456")).toBeNull();
    });

    it("should return null for empty channelId", () => {
      expect(parseChannelRef("twitch:")).toBeNull();
    });
  });

  describe("findChannelByRef", () => {
    it("should return the channelId from a ChannelRef", () => {
      const ref: ChannelRef = {
        platform: "twitch",
        channelId: "123456",
        username: "testuser",
      };
      expect(findChannelByRef(ref)).toBe("123456");
    });
  });

  describe("toChannelRef", () => {
    it("should convert platform and channel to ChannelRef", () => {
      const ref = toChannelRef("twitch", "123456");
      expect(ref).toEqual({
        platform: "twitch",
        channelId: "123456",
        username: "123456",
      });
    });
  });
});
