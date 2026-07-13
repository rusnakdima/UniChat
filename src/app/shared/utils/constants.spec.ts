import { describe, it, expect } from "vitest";
import {
  overlayFilterOverrideKey,
  overlayCustomCssKey,
  overlayChannelIdsKey,
  overlayMaxMessagesKey,
  overlayTextSizeKey,
  overlayAnimationTypeKey,
  overlayAnimationDirectionKey,
  overlayTransparentBgKey,
} from "./constants";

describe("overlay storage key functions", () => {
  const widgetId = "widget-main";

  it("should generate filter override key", () => {
    expect(overlayFilterOverrideKey(widgetId)).toBe("unichat:overlay:widget-main:filter_override");
  });

  it("should generate custom CSS key", () => {
    expect(overlayCustomCssKey(widgetId)).toBe("unichat:overlay:widget-main:custom_css");
  });

  it("should generate channel IDs key", () => {
    expect(overlayChannelIdsKey(widgetId)).toBe("unichat:overlay:widget-main:channel_ids");
  });

  it("should generate max messages key", () => {
    expect(overlayMaxMessagesKey(widgetId)).toBe("unichat:overlay:widget-main:max_messages");
  });

  it("should generate text size key", () => {
    expect(overlayTextSizeKey(widgetId)).toBe("unichat:overlay:widget-main:text_size");
  });

  it("should generate animation type key", () => {
    expect(overlayAnimationTypeKey(widgetId)).toBe("unichat:overlay:widget-main:animation_type");
  });

  it("should generate animation direction key", () => {
    expect(overlayAnimationDirectionKey(widgetId)).toBe(
      "unichat:overlay:widget-main:animation_direction"
    );
  });

  it("should generate transparent bg key", () => {
    expect(overlayTransparentBgKey(widgetId)).toBe("unichat:overlay:widget-main:transparent_bg");
  });

  it("should handle different widget IDs", () => {
    expect(overlayFilterOverrideKey("widget-2")).toBe("unichat:overlay:widget-2:filter_override");
  });
});
