import { TestBed } from "@angular/core/testing";
import { KickEmotesService } from "./kick-emotes.service";

describe("KickEmotesService", () => {
  let service: KickEmotesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(KickEmotesService);
  });

  it("should parse bracket emotes", () => {
    const content = "hi [emote:1730834:emojiYay] there";
    const emotes = service.extractBracketEmotes(content);
    expect(emotes.length).toBe(1);
    expect(emotes[0].id).toBe("1730834");
    expect(emotes[0].code).toBe("emojiYay");
    expect(emotes[0].provider).toBe("kick");
    expect(emotes[0].url).toContain("1730834");
  });

  it("should merge API emotes that do not overlap brackets", () => {
    const content = "abc";
    const api = [
      {
        emote_id: "99",
        positions: [{ s: 0, e: 2 }],
      },
    ];
    const merged = service.buildEmotesForMessage(content, api);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("99");
    expect(merged[0].code).toBe("abc");
  });

  it("should skip API positions that overlap bracket emotes", () => {
    const content = "[emote:1:x]";
    const api = [
      {
        emote_id: "2",
        positions: [{ s: 0, e: content.length - 1 }],
      },
    ];
    const merged = service.buildEmotesForMessage(content, api);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("1");
  });
});
