import { describe, it, expect } from "vitest";
import { extractYoutubeVideoId } from "./youtube-url-parser.util";

describe("YouTube URL Parser", () => {
  describe("extractYoutubeVideoId", () => {
    it("should extract video ID from youtube.com/watch URL", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      expect(extractYoutubeVideoId(url)).toBe("dQw4w9WgXcQ");
    });

    it("should extract video ID from youtu.be short URL", () => {
      const url = "https://youtu.be/dQw4w9WgXcQ";
      expect(extractYoutubeVideoId(url)).toBe("dQw4w9WgXcQ");
    });

    it("should extract video ID from youtube.com/embed URL", () => {
      const url = "https://www.youtube.com/embed/dQw4w9WgXcQ";
      expect(extractYoutubeVideoId(url)).toBe("dQw4w9WgXcQ");
    });

    it("should return null for invalid URL", () => {
      const url = "https://www.example.com/video";
      expect(extractYoutubeVideoId(url)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(extractYoutubeVideoId("")).toBeNull();
    });
  });
});
