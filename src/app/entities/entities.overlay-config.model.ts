export interface OverlayConfig {
  filterOverride: string;
  customCss: string;
  channelIds: string[];
  maxMessages: number;
  textSize: number;
  animationType: "slide" | "fade" | "none";
  animationDirection: "up" | "down" | "left" | "right";
  transparentBg: boolean;
  port: number;
}
