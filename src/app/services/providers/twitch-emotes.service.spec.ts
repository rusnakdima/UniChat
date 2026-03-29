import { TestBed } from "@angular/core/testing";
import { TwitchEmotesService } from "./twitch-emotes.service";
import { EmoteUrlService } from "@services/ui/emote-url.service";
import { IconsCatalogService } from "@services/ui/icons-catalog.service";

describe("TwitchEmotesService", () => {
  let service: TwitchEmotesService;
  let emoteUrl: jasmine.SpyObj<EmoteUrlService>;
  let iconsCatalog: jasmine.SpyObj<IconsCatalogService>;

  beforeEach(() => {
    emoteUrl = jasmine.createSpyObj("EmoteUrlService", ["getTwitchEmote"]);
    emoteUrl.getTwitchEmote.and.returnValue("https://cdn.example/emote.png");
    iconsCatalog = jasmine.createSpyObj("IconsCatalogService", [
      "resolveSevenTvEmote",
      "resolveTwitchBadgeIcon",
    ]);
    iconsCatalog.resolveSevenTvEmote.and.returnValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        TwitchEmotesService,
        { provide: EmoteUrlService, useValue: emoteUrl },
        { provide: IconsCatalogService, useValue: iconsCatalog },
      ],
    });
    service = TestBed.inject(TwitchEmotesService);
  });

  it("extractEmotesForTwitchMessage maps IRC emote ranges", () => {
    const text = "Kappa test";
    const emotes = service.extractEmotesForTwitchMessage(text, { "25": ["0-4"] }, undefined);
    expect(emotes.length).toBe(1);
    expect(emotes[0].id).toBe("25");
    expect(emotes[0].code).toBe("Kappa");
    expect(emoteUrl.getTwitchEmote).toHaveBeenCalledWith("25");
  });

  it("extractBadgeIconsForTwitchMessage resolves via catalog", () => {
    iconsCatalog.resolveTwitchBadgeIcon.and.returnValue({
      id: "moderator",
      label: "Moderator",
      url: "https://badge",
    });
    const icons = service.extractBadgeIconsForTwitchMessage({ moderator: "1" }, "room");
    expect(icons.length).toBe(1);
    expect(icons[0].label).toBe("Moderator");
    expect(iconsCatalog.resolveTwitchBadgeIcon).toHaveBeenCalledWith("room", "moderator", "1");
  });
});
