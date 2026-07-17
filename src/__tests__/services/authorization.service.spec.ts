import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PlatformAccount,
  AuthorizationService,
} from "../../../app/services/features/authorization.service";
import { PlatformType } from "../../../app/entities/chat.model";

/* -------------------------------------------------------------------------- */
/*                                    Mocks                                    */
/* -------------------------------------------------------------------------- */

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

const mockOpenUrl = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mockOpenUrl,
}));

vi.mock("@tauri-front/shared", () => ({
  InvokeWrapperService: vi.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

const mockChatListAddChannel = vi.fn();
const mockChatListGetChannels = vi.fn().mockReturnValue([]);
vi.mock("@services/data/chat-list.service", () => ({
  ChatListService: vi.fn().mockImplementation(() => ({
    addChannel: mockChatListAddChannel,
    getChannels: mockChatListGetChannels,
    getVisibleChannels: vi.fn().mockReturnValue([]),
    removeChannel: vi.fn(),
    toggleChannelVisibility: vi.fn(),
    updateChannelAccount: vi.fn(),
    updateChannelName: vi.fn(),
    getChats: vi.fn().mockReturnValue([]),
    getChannelDisplayName: vi.fn().mockReturnValue(""),
    channels: { value: [] },
  })),
}));

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                     */
/* -------------------------------------------------------------------------- */

function makeAccount(overrides: Partial<PlatformAccount> = {}): PlatformAccount {
  return {
    id: "acc-1",
    platform: "twitch",
    username: "testuser",
    userId: "u123",
    avatarUrl: "https://example.com/avatar.png",
    isConnected: true,
    authStatus: "Authorized",
    accessToken: "token-xyz",
    authorizedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Setup                                     */
/* -------------------------------------------------------------------------- */

describe("AuthorizationService", () => {
  let service: AuthorizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockOpenUrl.mockReset();
    mockChatListAddChannel.mockReset();
    mockChatListGetChannels.mockReturnValue([]);

    // Replace localStorage with a clean in-memory map
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      get length() {
        return storage.size;
      },
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
    });

    service = new AuthorizationService();
  });

  afterEach(() => {
    vi.unstubGlobal("localStorage");
  });

  /* ------------------------------ isAuthorized ------------------------------ */

  describe("isAuthorized()", () => {
    it("should return true for any action string", () => {
      expect(service.isAuthorized("chat:read")).toBe(true);
      expect(service.isAuthorized("moderation:delete")).toBe(true);
      expect(service.isAuthorized("")).toBe(true);
    });

    it("should always return true regardless of account state", () => {
      // Even with no accounts loaded, still returns true (stub implementation)
      expect(service.isAuthorized("anything")).toBe(true);
    });
  });

  /* ------------------------------ canModerate ------------------------------ */

  describe("canModerate()", () => {
    it("should return false regardless of account state", () => {
      expect(service.canModerate()).toBe(false);
    });
  });

  /* --------------------------- getAccountByIdSync --------------------------- */

  describe("getAccountByIdSync()", () => {
    it("should return undefined when no accounts are loaded", () => {
      expect(service.getAccountByIdSync("any-id")).toBeUndefined();
    });

    it("should return the matching account by id", () => {
      const account = makeAccount({ id: "acc-match", platform: "twitch" });
      service["_accounts"].set([account]);

      const result = service.getAccountByIdSync("acc-match");
      expect(result).toEqual(account);
    });

    it("should return undefined when no account matches the id", () => {
      service["_accounts"].set([makeAccount({ id: "acc-1" })]);
      expect(service.getAccountByIdSync("non-existent")).toBeUndefined();
    });

    it("should return undefined for empty id string when no accounts", () => {
      expect(service.getAccountByIdSync("")).toBeUndefined();
    });
  });

  /* --------------------------- getPrimaryAccount --------------------------- */

  describe("getPrimaryAccount()", () => {
    it("should return undefined when no accounts are loaded", () => {
      expect(service.getPrimaryAccount("twitch")).toBeUndefined();
    });

    it("should return the first account matching the given platform", () => {
      const twitch = makeAccount({ id: "tw-1", platform: "twitch" });
      const kick = makeAccount({ id: "ki-1", platform: "kick" });
      service["_accounts"].set([twitch, kick]);

      expect(service.getPrimaryAccount("twitch")).toEqual(twitch);
      expect(service.getPrimaryAccount("kick")).toEqual(kick);
    });

    it("should return undefined when no account matches the platform", () => {
      service["_accounts"].set([makeAccount({ platform: "twitch" })]);
      expect(service.getPrimaryAccount("youtube")).toBeUndefined();
    });
  });

  /* -------------------------- deauthorizeAccount -------------------------- */

  describe("deauthorizeAccount()", () => {
    it("should remove the account from the accounts signal", async () => {
      const account = makeAccount({ id: "acc-to-remove", platform: "twitch" });
      service["_accounts"].set([account]);

      await service.deauthorizeAccount("acc-to-remove");

      expect(service.getAccountByIdSync("acc-to-remove")).toBeUndefined();
    });

    it("should call api.invoke with auth_disconnect and correct platform", async () => {
      const account = makeAccount({ id: "acc-xyz", platform: "kick" });
      service["_accounts"].set([account]);

      await service.deauthorizeAccount("acc-xyz");

      expect(mockInvoke).toHaveBeenCalledWith("auth_disconnect", {
        platform: "kick",
        accountId: "acc-xyz",
      });
    });

    it("should still remove the account even if the API call throws", async () => {
      const account = makeAccount({ id: "acc-fail", platform: "youtube" });
      service["_accounts"].set([account]);
      mockInvoke.mockRejectedValueOnce(new Error("API error"));

      await service.deauthorizeAccount("acc-fail");

      expect(service.getAccountByIdSync("acc-fail")).toBeUndefined();
    });

    it("should do nothing when called with a non-existent accountId", async () => {
      service["_accounts"].set([]);

      await service.deauthorizeAccount("ghost-id");

      expect(mockInvoke).not.toHaveBeenCalled();
      // No error should be thrown
    });

    it("should use the account's own platform when platform argument is omitted", async () => {
      const account = makeAccount({ id: "acc-yt", platform: "youtube" });
      service["_accounts"].set([account]);

      await service.deauthorizeAccount("acc-yt");

      expect(mockInvoke).toHaveBeenCalledWith("auth_disconnect", {
        platform: "youtube",
        accountId: "acc-yt",
      });
    });
  });

  /* ----------------------------- authorize -------------------------------- */

  describe("authorize()", () => {
    it("should call auth_start with the correct platform", async () => {
      mockInvoke.mockResolvedValueOnce({ auth_url: "https://example.com/auth" });

      await service.authorize("twitch");

      expect(mockInvoke).toHaveBeenCalledWith("auth_start", { platform: "twitch" });
    });

    it("should open the auth URL returned by auth_start", async () => {
      mockInvoke.mockResolvedValueOnce({ auth_url: "https://example.com/oauth" });

      await service.authorize("twitch");

      expect(mockOpenUrl).toHaveBeenCalledWith("https://example.com/oauth");
    });

    it("should call auth_await_callback after opening the URL", async () => {
      mockInvoke
        .mockResolvedValueOnce({ auth_url: "https://example.com/auth" })
        .mockResolvedValueOnce(undefined);

      await service.authorize("twitch");

      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).toContain("auth_await_callback");
      const callbackCall = mockInvoke.mock.calls.find((c) => c[0] === "auth_await_callback");
      expect(callbackCall).toEqual(["auth_await_callback", { platform: "twitch" }]);
    });

    it("should call loadAccountStatus after auth_await_callback", async () => {
      mockInvoke
        .mockResolvedValueOnce({ auth_url: "https://example.com/auth" })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ accounts: [] });

      await service.authorize("twitch");

      const calls = mockInvoke.mock.calls.map((c) => c[0]);
      expect(calls).toContain("auth_status");
    });

    it("should handle auth_url alternative key (authUrl)", async () => {
      mockInvoke.mockResolvedValueOnce({ authUrl: "https://alt.example.com/auth" });

      await service.authorize("kick");

      expect(mockOpenUrl).toHaveBeenCalledWith("https://alt.example.com/auth");
    });

    it("should not open URL or call callbacks when auth_start returns no URL", async () => {
      mockInvoke.mockResolvedValueOnce({ success: false });

      await service.authorize("youtube");

      expect(mockOpenUrl).not.toHaveBeenCalled();
      expect(mockInvoke).not.toHaveBeenCalledWith("auth_await_callback", expect.anything());
    });

    it("should not throw when auth_start throws", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Network error"));

      await expect(service.authorize("twitch")).resolves.not.toThrow();
    });

    it("should not throw when openUrl throws", async () => {
      mockInvoke.mockResolvedValueOnce({ auth_url: "https://example.com/auth" });
      mockOpenUrl.mockRejectedValueOnce(new Error("Opener error"));

      await expect(service.authorize("twitch")).resolves.not.toThrow();
    });

    it("should add accounts returned by loadAccountStatus to the signal", async () => {
      const apiAccount = {
        id: "new-acc-1",
        platform: "twitch",
        username: "newuser",
        userId: "u999",
        avatarUrl: "https://example.com/new.png",
        authStatus: "Authorized",
        accessToken: "tok123",
        authorizedAt: "2024-06-01T00:00:00Z",
      };
      mockInvoke
        .mockResolvedValueOnce({ auth_url: "https://example.com/auth" })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ accounts: [apiAccount] });

      await service.authorize("twitch");

      const accounts = service.accounts;
      expect(accounts).toHaveLength(1);
      expect(accounts[0].id).toBe("new-acc-1");
      expect(accounts[0].username).toBe("newuser");
    });

    it("should add a channel for each new authorized account", async () => {
      const apiAccount = {
        id: "acc-ch",
        platform: "twitch",
        username: "streamer",
        userId: "u555",
        authStatus: "Authorized",
      };
      mockInvoke
        .mockResolvedValueOnce({ auth_url: "https://example.com/auth" })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ accounts: [apiAccount] });

      await service.authorize("twitch");

      expect(mockChatListAddChannel).toHaveBeenCalledWith({
        platform: "twitch",
        channelId: "streamer",
        channelName: "streamer",
        accountId: "acc-ch",
        isVisible: true,
        isAuthorized: true,
        addedAt: expect.any(String),
      });
    });

    it("should not add a duplicate channel if one already exists for the account", async () => {
      const apiAccount = {
        id: "acc-existing",
        platform: "twitch",
        username: "streamer",
        userId: "u555",
        authStatus: "Authorized",
      };
      mockChatListGetChannels.mockReturnValue([{ platform: "twitch", channelId: "streamer" }]);
      mockInvoke
        .mockResolvedValueOnce({ auth_url: "https://example.com/auth" })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ accounts: [apiAccount] });

      await service.authorize("twitch");

      expect(mockChatListAddChannel).not.toHaveBeenCalled();
    });
  });

  /* -------------------------- loadAccountStatus --------------------------- */

  describe("loadAccountStatus()", () => {
    it("should call api.invoke with auth_status and the platform", async () => {
      mockInvoke.mockResolvedValueOnce({ accounts: [] });

      // Access private method via bracket notation
      await (service as any).loadAccountStatus("twitch");

      expect(mockInvoke).toHaveBeenCalledWith("auth_status", { platform: "twitch" });
    });

    it("should update accounts signal with returned accounts", async () => {
      const apiAccount = {
        id: "loaded-1",
        platform: "kick",
        username: "kickuser",
        userId: "k999",
        authStatus: "authorized",
      };
      mockInvoke.mockResolvedValueOnce({ accounts: [apiAccount] });

      await (service as any).loadAccountStatus("kick");

      const accounts = service.accounts;
      expect(accounts).toHaveLength(1);
      expect(accounts[0].id).toBe("loaded-1");
      expect(accounts[0].platform).toBe("kick");
    });

    it("should replace existing accounts for the same platform", async () => {
      const existing = makeAccount({ id: "old-twitch", platform: "twitch" });
      service["_accounts"].set([existing]);

      const apiAccount = {
        id: "new-twitch",
        platform: "twitch",
        username: "newtwitch",
        userId: "t999",
        authStatus: "Authorized",
      };
      mockInvoke.mockResolvedValueOnce({ accounts: [apiAccount] });

      await (service as any).loadAccountStatus("twitch");

      const accounts = service.accounts;
      expect(accounts).toHaveLength(1);
      expect(accounts[0].id).toBe("new-twitch");
    });

    it("should preserve accounts for other platforms", async () => {
      const twitch = makeAccount({ id: "tw-1", platform: "twitch" });
      const kick = makeAccount({ id: "ki-1", platform: "kick" });
      service["_accounts"].set([twitch, kick]);

      mockInvoke.mockResolvedValueOnce({
        accounts: [
          {
            id: "new-tw",
            platform: "twitch",
            username: "newtw",
            userId: "t1",
            authStatus: "Authorized",
          },
        ],
      });

      await (service as any).loadAccountStatus("twitch");

      const accounts = service.accounts;
      expect(accounts).toHaveLength(2);
      expect(accounts.find((a) => a.id === "new-tw")?.platform).toBe("twitch");
      expect(accounts.find((a) => a.id === "ki-1")?.platform).toBe("kick");
    });

    it("should handle snake_case fields from API (user_id, avatar_url, etc.)", async () => {
      const apiAccount = {
        id: "snake-acc",
        platform: "youtube",
        username: "ytuser",
        user_id: "youtuber",
        avatar_url: "https://yt.com/avatar",
        auth_status: "Authorized",
        access_token: "yt-token",
        authorized_at: "2024-03-01T00:00:00Z",
      };
      mockInvoke.mockResolvedValueOnce({ accounts: [apiAccount] });

      await (service as any).loadAccountStatus("youtube");

      const account = service.accounts[0];
      expect(account.userId).toBe("youtuber");
      expect(account.avatarUrl).toBe("https://yt.com/avatar");
      expect(account.accessToken).toBe("yt-token");
      expect(account.authorizedAt).toBe("2024-03-01T00:00:00Z");
    });

    it("should mark isConnected as true when authStatus is Authorized (camelCase)", async () => {
      mockInvoke.mockResolvedValueOnce({
        accounts: [
          {
            id: "conn-1",
            platform: "twitch",
            username: "user",
            userId: "u1",
            authStatus: "Authorized",
          },
        ],
      });

      await (service as any).loadAccountStatus("twitch");

      expect(service.accounts[0].isConnected).toBe(true);
    });

    it("should mark isConnected as true when authStatus is authorized (lowercase)", async () => {
      mockInvoke.mockResolvedValueOnce({
        accounts: [
          {
            id: "conn-2",
            platform: "twitch",
            username: "user",
            userId: "u1",
            authStatus: "authorized",
          },
        ],
      });

      await (service as any).loadAccountStatus("twitch");

      expect(service.accounts[0].isConnected).toBe(true);
    });

    it("should mark isConnected as false for other authStatus values", async () => {
      mockInvoke.mockResolvedValueOnce({
        accounts: [
          {
            id: "conn-3",
            platform: "twitch",
            username: "user",
            userId: "u1",
            authStatus: "revoked",
          },
        ],
      });

      await (service as any).loadAccountStatus("twitch");

      expect(service.accounts[0].isConnected).toBe(false);
    });

    it("should not throw when API returns no accounts", async () => {
      mockInvoke.mockResolvedValueOnce({});

      await expect((service as any).loadAccountStatus("twitch")).resolves.not.toThrow();
      expect(service.accounts).toHaveLength(0);
    });

    it("should not throw when API throws", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("API failure"));

      await expect((service as any).loadAccountStatus("twitch")).resolves.not.toThrow();
    });
  });

  /* ------------------------- loadAllAccountStatuses ----------------------- */

  describe("loadAllAccountStatuses()", () => {
    it("should call loadAccountStatus for twitch, kick, and youtube", async () => {
      mockInvoke.mockResolvedValue({ accounts: [] });

      await service.loadAllAccountStatuses();

      expect(mockInvoke).toHaveBeenCalledWith("auth_status", { platform: "twitch" });
      expect(mockInvoke).toHaveBeenCalledWith("auth_status", { platform: "kick" });
      expect(mockInvoke).toHaveBeenCalledWith("auth_status", { platform: "youtube" });
    });

    it("should continue loading other platforms if one fails", async () => {
      mockInvoke
        .mockRejectedValueOnce(new Error("twitch fails"))
        .mockResolvedValue({ accounts: [] });

      await service.loadAllAccountStatuses();

      // twitch failed, but kick and youtube should still be attempted
      expect(mockInvoke).toHaveBeenCalledWith("auth_status", { platform: "kick" });
      expect(mockInvoke).toHaveBeenCalledWith("auth_status", { platform: "youtube" });
    });

    it("should not throw when any platform fails", async () => {
      mockInvoke.mockRejectedValue(new Error("Repeated error"));

      await expect(service.loadAllAccountStatuses()).resolves.not.toThrow();
    });
  });

  /* -------------------------- accounts signal -------------------------- */

  describe("accounts signal", () => {
    it("should reflect the current list of accounts", () => {
      service["_accounts"].set([
        makeAccount({ id: "sig-1", platform: "twitch" }),
        makeAccount({ id: "sig-2", platform: "kick" }),
      ]);

      expect(service.accounts).toHaveLength(2);
      expect(service.accounts.map((a) => a.platform)).toEqual(["twitch", "kick"]);
    });

    it("should persist accounts to localStorage", () => {
      service["_accounts"].set([makeAccount({ id: "persist-1" })]);

      // Read directly from the mocked storage
      const stored = localStorage.getItem("unichat_accounts");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("persist-1");
    });

    it("should load persisted accounts on construction", () => {
      // Pre-populate storage
      localStorage.setItem(
        "unichat_accounts",
        JSON.stringify([makeAccount({ id: "preloaded", platform: "youtube" })])
      );

      const freshService = new AuthorizationService();

      expect(freshService.accounts).toHaveLength(1);
      expect(freshService.accounts[0].id).toBe("preloaded");
    });
  });

  /* -------------------------- deauthorize alias -------------------------- */

  describe("deauthorize() (alias)", () => {
    it("should delegate to deauthorizeAccount", async () => {
      const account = makeAccount({ id: "alias-test" });
      service["_accounts"].set([account]);

      service.deauthorize("alias-test");

      // deauthorize is sync but calls the async deauthorizeAccount internally
      // The signal update happens asynchronously, so wait a tick
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(service.getAccountByIdSync("alias-test")).toBeUndefined();
    });
  });
});
