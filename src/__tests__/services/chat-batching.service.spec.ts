import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatBatchingService } from "../../app/services/data/chat-batching.service";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("ChatBatchingService", () => {
  let service: ChatBatchingService;

  beforeEach(() => {
    service = new ChatBatchingService();
  });

  describe("addToBatch", () => {
    it("should not throw when called with valid arguments", () => {
      expect(() => service.addToBatch("key1", { text: "hello" })).not.toThrow();
    });

    it("should not throw when called with empty key", () => {
      expect(() => service.addToBatch("", { text: "hello" })).not.toThrow();
    });

    it("should not throw when message is null", () => {
      expect(() => service.addToBatch("key1", null)).not.toThrow();
    });

    it("should not throw when message is undefined", () => {
      expect(() => service.addToBatch("key1", undefined)).not.toThrow();
    });
  });

  describe("flushBatch", () => {
    it("should not throw when called", () => {
      expect(() => service.flushBatch()).not.toThrow();
    });
  });

  describe("flushPendingBatchesNow", () => {
    it("should not throw when called", () => {
      expect(() => service.flushPendingBatchesNow()).not.toThrow();
    });
  });

  describe("scheduleBatchFlush", () => {
    it("should not throw when called", () => {
      expect(() => service.scheduleBatchFlush()).not.toThrow();
    });
  });
});
