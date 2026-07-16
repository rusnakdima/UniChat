import { describe, it, expect, beforeEach, vi } from "vitest";
import * as AngularCore from "@angular/core";
import { Injector, runInInjectionContext } from "@angular/core";
import { ChatListService } from "@services/data/chat-list.service";
import { DashboardPreferencesService } from "@services/ui/dashboard-preferences.service";

vi.mock("@angular/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@angular/core")>();
  const effectCallbacks = new Set<() => void>();
  return {
    ...actual,
    effect: vi.fn((sourceFn: () => void) => {
      effectCallbacks.add(sourceFn);
      sourceFn();
      return () => { effectCallbacks.delete(sourceFn); };
    }),
    __effectCallbacks: effectCallbacks,
  };
});

function flushEffects(): void {
  const callbacks = (AngularCore as any).__effectCallbacks as Set<() => void>;
  if (callbacks) callbacks.forEach((cb) => cb());
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
    getStore: () => store,
  };
})();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true, writable: true, value: localStorageMock,
});

const { randomUUIDSpy } = vi.hoisted(() => ({
  randomUUIDSpy: vi.fn(() => "test-uuid-1"),
}));
vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: randomUUIDSpy });

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@utils/channel-ref.util", () => ({
  buildChannelRef: vi.fn((p: string, id: string) => `${p}:${id}`),
  parseChannelRef: vi.fn(), findChannelByRef: vi.fn(),
  findChannelInArray: vi.fn(), toChannelRef: vi.fn(),
  toChannelRefFromChannel: vi.fn(), migrateLegacyChannelRefs: vi.fn(),
  ChannelRefService: vi.fn(),
}));

const prefsMock = {
  cleanMixedEnabledChannelIds: vi.fn(),
  addMixedEnabledChannelId: vi.fn(),
  removeMixedEnabledChannelId: vi.fn(),
  setMixedEnabledChannelIds: vi.fn(),
  getPreferences: vi.fn().mockReturnValue({
    theme: "dark", fontSize: 14, mixedEnabledChannelIds: new Set(), autoScroll: true,
    feedMode: "mixed", densityMode: "comfortable", splitLayout: {},
  }),
  savePreferences: vi.fn(),
};
vi.mock("@services/ui/dashboard-preferences.service", () => ({
  DashboardPreferencesService: vi.fn(() => prefsMock),
}));

describe("Injector diagnostic", () => {
  it("should inspect Injector.create and runInInjectionContext", () => {
    console.log("=== Injector type:", typeof AngularCore.Injector);
    console.log("=== runInInjectionContext type:", typeof AngularCore.runInInjectionContext);
    
    const rootInjector = AngularCore.Injector.create({
      providers: [{ provide: DashboardPreferencesService, useValue: prefsMock }],
    });
    console.log("=== rootInjector:", rootInjector);
    console.log("=== rootInjector.runInInjectionContext:", (rootInjector as any).runInInjectionContext);
    
    const result = runInInjectionContext(rootInjector, () => "test-value");
    console.log("=== runInInjectionContext result:", result);
  });

  it("should check if service.getChats() returns data", () => {
    const channels = [{ id: "ch-1", platform: "twitch" as const, channelId: "c1", channelName: "C1", channelImageUrl: undefined, isAuthorized: true, accountId: "a1", accountCapabilities: undefined, isVisible: true, addedAt: "2024-01-01" }];
    localStorageMock.getStore()["unichat_channels"] = JSON.stringify(channels);
    localStorageMock.getItem.mockReturnValue(JSON.stringify(channels));
    
    const rootInjector = AngularCore.Injector.create({
      providers: [{ provide: DashboardPreferencesService, useValue: prefsMock }],
    });
    const service = runInInjectionContext(rootInjector, () => new ChatListService());
    console.log("=== service:", service);
    console.log("=== service.getChats():", service.getChats());
    expect(service.getChats()).toHaveLength(1);
  });
});
