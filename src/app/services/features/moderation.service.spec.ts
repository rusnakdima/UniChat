import { TestBed } from "@angular/core/testing";
import { ModerationService, DEFAULT_MODERATION_MACROS } from "./moderation.service";
import { ChatListService } from "@services/data/chat-list.service";
import { AuthorizationService } from "@services/features/authorization.service";

describe("ModerationService", () => {
  let service: ModerationService;
  let chatListService: jasmine.SpyObj<ChatListService>;
  let authorizationService: jasmine.SpyObj<AuthorizationService>;

  beforeEach(() => {
    const chatListSpy = jasmine.createSpyObj("ChatListService", ["getChannels"]);
    const authSpy = jasmine.createSpyObj("AuthorizationService", ["getAccountById"]);

    TestBed.configureTestingModule({
      providers: [
        ModerationService,
        { provide: ChatListService, useValue: chatListSpy },
        { provide: AuthorizationService, useValue: authSpy },
      ],
    });

    service = TestBed.inject(ModerationService);
    chatListService = TestBed.inject(ChatListService) as jasmine.SpyObj<ChatListService>;
    authorizationService = TestBed.inject(
      AuthorizationService
    ) as jasmine.SpyObj<AuthorizationService>;
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  describe("DEFAULT_MODERATION_MACROS", () => {
    it("should have default macros defined", () => {
      expect(DEFAULT_MODERATION_MACROS.length).toBeGreaterThan(0);
    });

    it("should have timeout macros", () => {
      const timeoutMacros = DEFAULT_MODERATION_MACROS.filter((m) => m.action === "timeout");
      expect(timeoutMacros.length).toBeGreaterThan(0);
    });

    it("should have ban macro", () => {
      const banMacros = DEFAULT_MODERATION_MACROS.filter((m) => m.action === "ban");
      expect(banMacros.length).toBeGreaterThan(0);
    });

    it("should have delete macro", () => {
      const deleteMacros = DEFAULT_MODERATION_MACROS.filter((m) => m.action === "delete");
      expect(deleteMacros.length).toBeGreaterThan(0);
    });
  });

  describe("moderate", () => {
    beforeEach(() => {
      chatListService.getChannels.and.returnValue([
        {
          id: "ch1",
          platform: "twitch",
          channelId: "channel1",
          channelName: "testchannel",
          isAuthorized: true,
          accountId: "acc1",
          isVisible: true,
          addedAt: new Date().toISOString(),
        },
      ]);

      authorizationService.getAccountById.and.returnValue({
        id: "acc1",
        platform: "twitch",
        username: "testuser",
        userId: "user1",
        authStatus: "authorized",
        authorizedAt: new Date().toISOString(),
      });
    });

    it("should return error if channel not found", async () => {
      chatListService.getChannels.and.returnValue([]);

      const result = await service.moderate("twitch", "nonexistent", "user", "timeout");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Channel not found");
    });

    it("should return error if not authorized", async () => {
      authorizationService.getAccountById.and.returnValue({
        id: "acc1",
        platform: "twitch",
        username: "testuser",
        userId: "user1",
        authStatus: "unauthorized",
        authorizedAt: new Date().toISOString(),
      });

      const result = await service.moderate("twitch", "channel1", "user", "timeout");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not authorized");
    });

    it("should execute Twitch moderation", async () => {
      const result = await service.moderate("twitch", "channel1", "testuser", "timeout", {
        duration: 60,
        reason: "Spam",
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe("timeout");
      expect(result.platform).toBe("twitch");
      expect(result.duration).toBe(60);
      expect(result.reason).toBe("Spam");
    });

    it("should execute Kick moderation", async () => {
      const result = await service.moderate("kick", "channel1", "testuser", "ban");

      expect(result.success).toBe(true);
      expect(result.action).toBe("ban");
      expect(result.platform).toBe("kick");
    });

    it("should reject timeout for YouTube", async () => {
      const result = await service.moderate("youtube", "channel1", "testuser", "timeout");

      expect(result.success).toBe(false);
      expect(result.error).toContain("doesn't support timeout");
    });

    it("should allow ban for YouTube", async () => {
      const result = await service.moderate("youtube", "channel1", "testuser", "ban");

      expect(result.success).toBe(true);
      expect(result.action).toBe("ban");
      expect(result.platform).toBe("youtube");
    });
  });

  describe("executeMacro", () => {
    beforeEach(() => {
      chatListService.getChannels.and.returnValue([
        {
          id: "ch1",
          platform: "twitch",
          channelId: "channel1",
          channelName: "testchannel",
          isAuthorized: true,
          accountId: "acc1",
          isVisible: true,
          addedAt: new Date().toISOString(),
        },
      ]);

      authorizationService.getAccountById.and.returnValue({
        id: "acc1",
        platform: "twitch",
        username: "testuser",
        userId: "user1",
        authStatus: "authorized",
        authorizedAt: new Date().toISOString(),
      });
    });

    it("should execute a macro", async () => {
      const macro = DEFAULT_MODERATION_MACROS.find((m) => m.id === "timeout-1m");

      if (!macro) {
        fail("timeout-1m macro not found");
        return;
      }

      const result = await service.executeMacro("twitch", "channel1", "testuser", macro);

      expect(result.success).toBe(true);
      expect(result.action).toBe(macro.action);
      expect(result.duration).toBe(macro.duration);
      expect(result.reason).toBe(macro.reason);
    });
  });

  describe("getMacrosForPlatform", () => {
    it("should return all macros for Twitch", () => {
      const macros = service.getMacrosForPlatform("twitch");
      expect(macros.length).toBe(DEFAULT_MODERATION_MACROS.length);
    });

    it("should return all macros for Kick", () => {
      const macros = service.getMacrosForPlatform("kick");
      expect(macros.length).toBe(DEFAULT_MODERATION_MACROS.length);
    });

    it("should filter out timeout macros for YouTube", () => {
      const macros = service.getMacrosForPlatform("youtube");
      const timeoutMacros = macros.filter((m) => m.action === "timeout");
      expect(timeoutMacros.length).toBe(0);
    });
  });

  describe("canModerate", () => {
    it("should return false if channel not found", () => {
      chatListService.getChannels.and.returnValue([]);

      const result = service.canModerate("twitch", "nonexistent");

      expect(result).toBe(false);
    });

    it("should return false if account not authorized", () => {
      chatListService.getChannels.and.returnValue([
        {
          id: "ch1",
          platform: "twitch",
          channelId: "channel1",
          channelName: "testchannel",
          isAuthorized: false,
          accountId: "acc1",
          isVisible: true,
          addedAt: new Date().toISOString(),
        },
      ]);

      authorizationService.getAccountById.and.returnValue({
        id: "acc1",
        platform: "twitch",
        username: "testuser",
        userId: "user1",
        authStatus: "unauthorized",
        authorizedAt: new Date().toISOString(),
      });

      const result = service.canModerate("twitch", "channel1");

      expect(result).toBe(false);
    });

    it("should return accountCapabilities.canModerate if available", () => {
      chatListService.getChannels.and.returnValue([
        {
          id: "ch1",
          platform: "twitch",
          channelId: "channel1",
          channelName: "testchannel",
          isAuthorized: true,
          accountId: "acc1",
          accountCapabilities: {
            canListen: true,
            canReply: true,
            canDelete: true,
            canModerate: true,
            moderationRole: "moderator" as const,
            verified: true,
          },
          isVisible: true,
          addedAt: new Date().toISOString(),
        },
      ]);

      authorizationService.getAccountById.and.returnValue({
        id: "acc1",
        platform: "twitch",
        username: "testuser",
        userId: "user1",
        authStatus: "authorized",
        authorizedAt: new Date().toISOString(),
      });

      const result = service.canModerate("twitch", "channel1");

      expect(result).toBe(true);
    });
  });

  describe("getModerationCapabilities", () => {
    it("should return full capabilities for Twitch", () => {
      const caps = service.getModerationCapabilities("twitch");

      expect(caps.canTimeout).toBe(true);
      expect(caps.canBan).toBe(true);
      expect(caps.canDelete).toBe(true);
      expect(caps.canVip).toBe(true);
      expect(caps.canMod).toBe(true);
    });

    it("should return full capabilities for Kick", () => {
      const caps = service.getModerationCapabilities("kick");

      expect(caps.canTimeout).toBe(true);
      expect(caps.canBan).toBe(true);
      expect(caps.canDelete).toBe(true);
      expect(caps.canVip).toBe(true);
      expect(caps.canMod).toBe(true);
    });

    it("should return limited capabilities for YouTube", () => {
      const caps = service.getModerationCapabilities("youtube");

      expect(caps.canTimeout).toBe(false);
      expect(caps.canBan).toBe(true);
      expect(caps.canDelete).toBe(true);
      expect(caps.canVip).toBe(false);
      expect(caps.canMod).toBe(false);
    });
  });
});
