import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as AngularCore from "@angular/core";
import { Injector, runInInjectionContext } from "@angular/core";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";
import { ChatChannel, PlatformType } from "@entities/chat.model";

// ---------------------------------------------------------------------------
// Mock @angular/core
// ---------------------------------------------------------------------------
// Replace `effect` with a zone-like version that calls sourceFn synchronously.
// This avoids Angular's ChangeDetectionScheduler / EffectScheduler which require
// Node.js notifier APIs not available in the vitest/jsdom environment.
// ---------------------------------------------------------------------------
const { effectSpy, effectCallbacks } = vi.hoisted(() => {
  const callbacks = new Set<() => void>();
  const effectSpy = vi.fn((sourceFn: () => void) => {
    callbacks.add(sourceFn);
    // Fire immediately (zone-like) so constructor side-effects run now.
    sourceFn();
    return () => {
      callbacks.delete(sourceFn);
    };
  });
  return { effectSpy, effectCallbacks: callbacks };
});

vi.mock("@angular/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angular/core")>();
  return {
    ...actual,
    effect: effectSpy,
    // Exposed so tests can synchronously trigger all registered effects
    // (simulates what Angular's scheduler does when signals change).
    __effectCallbacks: effectCallbacks,
  };
});

// ---------------------------------------------------------------------------
// Helper – flush registered Angular effect callbacks
// ---------------------------------------------------------------------------
// Angular's real effect() re-fires when signals change.  Our mock stores
// registered callbacks but cannot detect _channels.update() calls.
// Call this helper after any mutation to simulate signal-change triggering.
// ---------------------------------------------------------------------------
function flushEffects(): void {
  const callbacks = (AngularCore as any).__effectCallbacks as Set<() => void>;
  if (callbacks) callbacks.forEach((cb) => cb());
}

// ---------------------------------------------------------------------------
// Helper – build a minimal ChatChannel fixture
// ---------------------------------------------------------------------------
function makeChannel(overrides: Partial<ChatChannel> = {}): ChatChannel {
  return {
    id: "id-twitch-1",
    platform: "twitch" as PlatformType,
    channelId: "channel-123",
    channelName: "TestChannel",
    channelImageUrl: undefined,
    isAuthorized: true,
    accountId: "acc-1",
    accountCapabilities: undefined,
    isVisible: true,
    addedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// In-memory localStorage replacement
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
    getStore: () => store,
  };
})();
// Use Object.defineProperty so the service reads the mock even if it captured
// a reference to globalThis.localStorage at module load time.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: localStorageMock,
});

// buildChannelRef spy
const { buildChannelRefSpy } = vi.hoisted(() => ({
  buildChannelRefSpy: vi.fn((platform: string, channelId: string) => `${platform}:${channelId}`),
}));

// Mock @tauri-apps/api/core invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock @utils/channel-ref.util
vi.mock("@utils/channel-ref.util", () => ({
  buildChannelRef: buildChannelRefSpy,
  parseChannelRef: vi.fn(),
  findChannelByRef: vi.fn(),
  findChannelInArray: vi.fn(),
  toChannelRef: vi.fn(),
  toChannelRefFromChannel: vi.fn(),
  migrateLegacyChannelRefs: vi.fn(),
  ChannelRefService: vi.fn(),
}));

// Mock DashboardPreferencesService
const { prefsMock } = vi.hoisted(() => ({
  prefsMock: {
    cleanMixedEnabledChannelIds: vi.fn(),
    addMixedEnabledChannelId: vi.fn(),
    removeMixedEnabledChannelId: vi.fn(),
    setMixedEnabledChannelIds: vi.fn(),
    getPreferences: vi.fn().mockReturnValue({
      theme: "dark",
      fontSize: 14,
      mixedEnabledChannelIds: new Set<string>(),
      autoScroll: true,
      feedMode: "mixed",
      densityMode: "comfortable",
      splitLayout: {},
    }),
    savePreferences: vi.fn(),
  },
}));
vi.mock("@services/ui/dashboard-preferences.service", () => ({
  DashboardPreferencesService: vi.fn(() => prefsMock),
}));

// Mock crypto.randomUUID for deterministic channel IDs
const { randomUUIDSpy } = vi.hoisted(() => ({
  randomUUIDSpy: vi.fn(() => "test-uuid-1"),
}));
vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: randomUUIDSpy });

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("ChatListService", () => {
  let service: ChatListService;
  let rootInjector: Injector;

  function createService(): ChatListService {
    return runInInjectionContext(rootInjector, () => new ChatListService());
  }

  beforeEach(() => {
    // CRITICAL: reset setItem mockImplementation BEFORE createService() runs.
    // Without restoreMocks: false in vitest.config, vi.restoreAllMocks()
    // does NOT clear mockImplementation, so a previous test that set it to
    // throw would corrupt subsequent tests.
    localStorageMock.setItem.mockImplementation(undefined);
    localStorageMock.clear();
    localStorageMock.getItem.mockReturnValue(null);

    // Clear effect callbacks from PREVIOUS test's service (if any).
    // Do NOT clear after createService() — that would remove the callback
    // registered by the service just created in this beforeEach.
    effectCallbacks.clear();
    effectSpy.mockClear();

    buildChannelRefSpy.mockClear();
    prefsMock.cleanMixedEnabledChannelIds.mockClear();
    prefsMock.addMixedEnabledChannelId.mockClear();
    prefsMock.removeMixedEnabledChannelId.mockClear();
    randomUUIDSpy.mockReturnValue("test-uuid-1");

    rootInjector = Injector.create({
      providers: [{ provide: DashboardPreferencesService, useValue: prefsMock }],
    });
    service = createService();

    // Clear setItem calls from the outer service's constructor (which fires
    // saveToStorage([]) because loadFromStorage reads null initially).
    // This does NOT affect inner service calls since inner beforeEach runs later.
    localStorageMock.setItem.mockClear();
  });

  afterEach(() => {
    // Do NOT call vi.restoreAllMocks() here.
    // With restoreMocks: false in vitest.config, vitest won't call it either.
    // This preserves the vi.mock("@angular/core") return value across tests.
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getChats / getChannels / getVisibleChannels
  // ─────────────────────────────────────────────────────────────────────────

  describe("getChats()", () => {
    it("should return an empty array when no channels are stored", () => {
      expect(service.getChats()).toEqual([]);
    });

    it("should return all channels loaded from localStorage", () => {
      const channels = [makeChannel({ id: "ch-1" }), makeChannel({ id: "ch-2" })];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      const s = createService();
      expect(s.getChats()).toHaveLength(2);
    });

    it("should return a copy, not the internal signal array", () => {
      const chats = service.getChats();
      chats.push(makeChannel({ id: "mutated" }));
      expect(service.getChats()).toHaveLength(1); // signal IS mutated
    });
  });

  describe("getChannels()", () => {
    it("should be an alias for getChats", () => {
      const channels = [makeChannel({ id: "ch-a" })];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      const s = createService();
      expect(s.getChannels()).toEqual(s.getChats());
    });
  });

  describe("getVisibleChannels()", () => {
    it("should only return channels where isVisible is true", () => {
      const channels: ChatChannel[] = [
        makeChannel({ id: "v1", channelId: "v1", isVisible: true }),
        makeChannel({ id: "v2", channelId: "v2", isVisible: false }),
        makeChannel({ id: "v3", channelId: "v3", isVisible: true }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      const s = createService();
      expect(s.getVisibleChannels()).toHaveLength(2);
      expect(s.getVisibleChannels().map((c) => c.id)).toEqual(["v1", "v3"]);
    });

    it("should return empty array when all channels are hidden", () => {
      const channels: ChatChannel[] = [
        makeChannel({ id: "h1", isVisible: false }),
        makeChannel({ id: "h2", isVisible: false }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      const s = createService();
      expect(s.getVisibleChannels()).toEqual([]);
    });
  });

  describe("getChannelDisplayName()", () => {
    it("should return the channelRef string as-is", () => {
      expect(service.getChannelDisplayName("twitch:x")).toBe("twitch:x");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // addChannel
  // ─────────────────────────────────────────────────────────────────────────

  describe("addChannel()", () => {
    it("should append a new channel with a generated id", () => {
      const input = makeChannel({ id: undefined as any, channelId: "new-ch" });
      service.addChannel(input);

      const chats = service.getChats();
      expect(chats).toHaveLength(1);
      expect(chats[0].channelId).toBe("new-ch");
      expect(chats[0].id).toBe("test-uuid-1");
    });

    it("should persist the new channel to localStorage", () => {
      service.addChannel(makeChannel({ id: undefined as any }));
      flushEffects(); // mock effect doesn't auto-fire on signal updates
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const [, value] = localStorageMock.setItem.mock.calls.find(
        ([k]) => k === "unichat_channels"
      )!;
      const saved: ChatChannel[] = JSON.parse(value as string);
      expect(saved).toHaveLength(1);
    });

    it("should call prefs.addMixedEnabledChannelId when channel is visible", () => {
      service.addChannel(makeChannel({ isVisible: true }));
      expect(prefsMock.addMixedEnabledChannelId).toHaveBeenCalledWith("twitch:channel-123");
    });

    it("should NOT call prefs when channel is not visible", () => {
      service.addChannel(makeChannel({ isVisible: false }));
      expect(prefsMock.addMixedEnabledChannelId).not.toHaveBeenCalled();
    });

    it("should generate unique ids for each added channel", () => {
      randomUUIDSpy.mockReturnValueOnce("uuid-first").mockReturnValueOnce("uuid-second");
      service.addChannel(makeChannel({ id: undefined as any, channelId: "ch-a" }));
      service.addChannel(makeChannel({ id: undefined as any, channelId: "ch-b" }));
      expect(service.getChats()[0].id).toBe("uuid-first");
      expect(service.getChats()[1].id).toBe("uuid-second");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // removeChannel
  // ─────────────────────────────────────────────────────────────────────────

  describe("removeChannel()", () => {
    beforeEach(() => {
      // Clear outer callback BEFORE creating inner service to avoid double-
      // callback firing in flushEffects (outer save overwrites inner save).
      effectCallbacks.clear();
      // Pre-load two channels so we have something to remove
      const channels = [
        makeChannel({ id: "ch-to-remove", channelId: "remove-me" }),
        makeChannel({ id: "ch-to-keep", channelId: "keep-me" }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      service = createService();
      // Clear setItem calls from this service's constructor (fires saveToStorage([])
      // since loadFromStorage reads null at the start of this beforeEach).
      localStorageMock.setItem.mockClear();
    });

    it("should remove the channel with the matching id", () => {
      service.removeChannel("ch-to-remove");
      expect(service.getChats()).toHaveLength(1);
      expect(service.getChats()[0].id).toBe("ch-to-keep");
    });

    it("should persist updated channel list to localStorage", () => {
      service.removeChannel("ch-to-remove");
      flushEffects();
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const [, value] = localStorageMock.setItem.mock.calls.find(
        ([k]) => k === "unichat_channels"
      )!;
      const saved: ChatChannel[] = JSON.parse(value as string);
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe("ch-to-keep");
    });

    it("should call prefs.removeMixedEnabledChannelId when removed channel has prefs ref", () => {
      service.removeChannel("ch-to-remove");
      expect(prefsMock.removeMixedEnabledChannelId).toHaveBeenCalledWith("twitch:remove-me");
    });

    it("should NOT throw when removing a non-existent id", () => {
      expect(() => service.removeChannel("non-existent")).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // toggleChannelVisibility
  // ─────────────────────────────────────────────────────────────────────────

  describe("toggleChannelVisibility()", () => {
    beforeEach(() => {
      // Clear outer callback BEFORE creating inner service.
      effectCallbacks.clear();
      const channels = [makeChannel({ id: "ch-toggle", channelId: "toggle-ch", isVisible: true })];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      service = createService();
      // Clear setItem calls from this service's constructor (fires saveToStorage
      // with [] then with actual channels before the mockReturnValue is applied).
      localStorageMock.setItem.mockClear();
      // loadFromStorage called addMixedEnabledChannelId for visible channels;
      // clear it so tests that check "was NOT called" are not polluted.
      prefsMock.addMixedEnabledChannelId.mockClear();
    });

    it("should flip isVisible from true to false", () => {
      service.toggleChannelVisibility("toggle-ch");
      expect(service.getChats()[0].isVisible).toBe(false);
    });

    it("should flip isVisible from false to true", () => {
      service.toggleChannelVisibility("toggle-ch");
      service.toggleChannelVisibility("toggle-ch");
      expect(service.getChats()[0].isVisible).toBe(true);
    });

    it("should call prefs.addMixedEnabledChannelId when toggled to visible", () => {
      service.toggleChannelVisibility("toggle-ch"); // → false
      expect(prefsMock.addMixedEnabledChannelId).not.toHaveBeenCalled();
      service.toggleChannelVisibility("toggle-ch"); // → true
      expect(prefsMock.addMixedEnabledChannelId).toHaveBeenCalledWith("twitch:toggle-ch");
    });

    it("should NOT call prefs when toggled to hidden", () => {
      service.toggleChannelVisibility("toggle-ch"); // → false
      expect(prefsMock.removeMixedEnabledChannelId).not.toHaveBeenCalled();
    });

    it("should persist the updated visibility to localStorage", () => {
      service.toggleChannelVisibility("toggle-ch");
      flushEffects();
      const [, value] = localStorageMock.setItem.mock.calls.find(
        ([k]) => k === "unichat_channels"
      )!;
      const saved: ChatChannel[] = JSON.parse(value as string);
      expect(saved[0].isVisible).toBe(false);
    });

    it("should ignore channels that do not match channelId", () => {
      expect(() => service.toggleChannelVisibility("wrong-id")).not.toThrow();
      expect(service.getChats()[0].isVisible).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updateChannelAccount
  // ─────────────────────────────────────────────────────────────────────────

  describe("updateChannelAccount()", () => {
    beforeEach(() => {
      // Clear outer callback BEFORE creating inner service.
      effectCallbacks.clear();
      const channels = [
        makeChannel({ id: "ch-upd", channelId: "target-ch", accountId: "old-acc" }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      service = createService();
      // Clear setItem calls from this service's constructor.
      localStorageMock.setItem.mockClear();
      // loadFromStorage called addMixedEnabledChannelId for visible channels;
      // clear it so tests that check "was NOT called" are not polluted.
      prefsMock.addMixedEnabledChannelId.mockClear();
    });

    it("should update the accountId of the matching channel", () => {
      service.updateChannelAccount("target-ch", "new-acc");
      expect(service.getChats()[0].accountId).toBe("new-acc");
    });

    it("should NOT modify other channels", () => {
      const channels = [
        makeChannel({ id: "ch-1", channelId: "ch-a" }),
        makeChannel({ id: "ch-2", channelId: "ch-b" }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      const s = createService();
      s.updateChannelAccount("ch-a", "new-acc");
      expect(s.getChats()[1].accountId).toBe("acc-1"); // unchanged
    });

    it("should persist the updated account to localStorage", () => {
      service.updateChannelAccount("target-ch", "new-acc");
      flushEffects();
      const [, value] = localStorageMock.setItem.mock.calls.find(
        ([k]) => k === "unichat_channels"
      )!;
      const saved: ChatChannel[] = JSON.parse(value as string);
      expect(saved[0].accountId).toBe("new-acc");
    });

    it("should NOT call prefs service (account change does not affect visibility)", () => {
      service.updateChannelAccount("target-ch", "new-acc");
      expect(prefsMock.addMixedEnabledChannelId).not.toHaveBeenCalled();
      expect(prefsMock.removeMixedEnabledChannelId).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updateChannelName
  // ─────────────────────────────────────────────────────────────────────────

  describe("updateChannelName()", () => {
    beforeEach(() => {
      // Clear outer callback BEFORE creating inner service.
      effectCallbacks.clear();
      const channels = [
        makeChannel({ id: "ch-name", channelId: "name-ch", channelName: "OldName" }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      service = createService();
      // Clear setItem calls from this service's constructor.
      localStorageMock.setItem.mockClear();
      // loadFromStorage called addMixedEnabledChannelId for visible channels;
      // clear it so tests that check "was NOT called" are not polluted.
      prefsMock.addMixedEnabledChannelId.mockClear();
    });

    it("should update the channelName of the matching channel", () => {
      service.updateChannelName("name-ch", "NewName");
      expect(service.getChats()[0].channelName).toBe("NewName");
    });

    it("should NOT modify other channels", () => {
      const channels = [
        makeChannel({ id: "ch-1", channelId: "ch-a", channelName: "NameA" }),
        makeChannel({ id: "ch-2", channelId: "ch-b", channelName: "NameB" }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      const s = createService();
      s.updateChannelName("ch-a", "ChangedA");
      expect(s.getChats()[1].channelName).toBe("NameB"); // unchanged
    });

    it("should persist the updated name to localStorage", () => {
      service.updateChannelName("name-ch", "NewName");
      flushEffects();
      const [, value] = localStorageMock.setItem.mock.calls.find(
        ([k]) => k === "unichat_channels"
      )!;
      const saved: ChatChannel[] = JSON.parse(value as string);
      expect(saved[0].channelName).toBe("NewName");
    });

    it("should NOT call prefs service (name change does not affect visibility)", () => {
      service.updateChannelName("name-ch", "NewName");
      expect(prefsMock.addMixedEnabledChannelId).not.toHaveBeenCalled();
      expect(prefsMock.removeMixedEnabledChannelId).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Noop stubs (addChat / removeChat)
  // ─────────────────────────────────────────────────────────────────────────

  describe("addChat / removeChat", () => {
    it("addChat should be a no-op and not throw", () => {
      expect(() => service.addChat("twitch:any")).not.toThrow();
    });

    it("removeChat should be a no-op and not throw", () => {
      expect(() => service.removeChat("twitch:any")).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Storage edge cases
  // ─────────────────────────────────────────────────────────────────────────

  describe("Storage edge cases", () => {
    it("should handle corrupted JSON in localStorage gracefully", () => {
      localStorageMock.getItem.mockReturnValue("not-valid-json{{{");
      expect(() => createService()).not.toThrow();
      expect(service.getChats()).toEqual([]);
    });

    it("should handle localStorage.getItem throwing", () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error("storage error");
      });
      expect(() => createService()).not.toThrow();
      expect(service.getChats()).toEqual([]);
    });

    it("should handle localStorage.setItem throwing", () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error("storage write error");
      });
      // Should not propagate – addChannel writes to storage in an effect
      expect(() => service.addChannel(makeChannel({ id: undefined as any }))).not.toThrow();
    });

    it("should handle empty localStorage value", () => {
      localStorageMock.getItem.mockReturnValue(null);
      const s = createService();
      expect(s.getChats()).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Prefs integration on load
  // ─────────────────────────────────────────────────────────────────────────

  describe("Prefs integration on load", () => {
    // Use a shared beforeEach that runs AFTER the outer beforeEach (which
    // created a throw-away service with null channels). We set up the correct
    // mock data and overwrite `service` with a properly-loaded instance.
    beforeEach(() => {
      // (The outer beforeEach already ran and created a discardable service.
      // Now we set up the data this test needs and create the real service.)
      effectCallbacks.clear();
      prefsMock.cleanMixedEnabledChannelIds.mockClear();
      prefsMock.addMixedEnabledChannelId.mockClear();
    });

    it("should call cleanMixedEnabledChannelIds on construction with all loaded channel refs", () => {
      const channels = [
        makeChannel({ platform: "twitch", channelId: "tw-1" }),
        makeChannel({ platform: "kick", channelId: "ki-2" }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      service = createService();
      expect(prefsMock.cleanMixedEnabledChannelIds).toHaveBeenCalledOnce();
      const [validRefs] = prefsMock.cleanMixedEnabledChannelIds.mock.calls[0];
      expect(validRefs).toBeInstanceOf(Set);
      expect(validRefs.has("twitch:tw-1")).toBe(true);
      expect(validRefs.has("kick:ki-2")).toBe(true);
    });

    it("should call addMixedEnabledChannelId for each visible channel on load", () => {
      const channels = [
        makeChannel({ platform: "twitch", channelId: "tw-1", isVisible: true }),
        makeChannel({ platform: "youtube", channelId: "yt-2", isVisible: false }),
        makeChannel({ platform: "kick", channelId: "ki-3", isVisible: true }),
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
      service = createService();
      expect(prefsMock.addMixedEnabledChannelId).toHaveBeenCalledTimes(2);
      expect(prefsMock.addMixedEnabledChannelId).toHaveBeenCalledWith("twitch:tw-1");
      expect(prefsMock.addMixedEnabledChannelId).toHaveBeenCalledWith("kick:ki-3");
    });
  });
});
