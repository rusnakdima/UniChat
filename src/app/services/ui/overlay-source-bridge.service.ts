import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class OverlaySourceBridgeService {
  connect(): void {}
  disconnect(): void {}
  sendMessage(data: unknown): void {}

  ensureConnected(): void {}
  forwardMessage(message: unknown): void {}
}
