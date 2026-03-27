import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { ChatMessage, PlatformType } from "@models/chat.model";

type OverlaySourcePayload = {
  type: "chatMessage";
  message: {
    id: string;
    platform: PlatformType;
    author: string;
    text: string;
    timestamp: string;
    isSupporter: boolean;
    sourceChannelId: string;
    authorAvatarUrl?: string;
  };
};

@Injectable({
  providedIn: "root",
})
export class OverlaySourceBridgeService {
  private socket: WebSocket | null = null;
  private connectedPort: number | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000; // 1 second base delay

  /**
   * Ensure overlay server is running and WS source connection is open.
   * Safe to call multiple times; connection is re-created only if `port` changes.
   */
  async ensureConnected(port: number): Promise<void> {
    if (!port || !Number.isFinite(port) || port <= 0) {
      console.error("[OverlaySourceBridge] Invalid port:", port);
      return;
    }

    if (this.connectedPort === port && this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.connectedPort = port;
    this.reconnectAttempts = 0;

    // Start overlay server if it isn't already running.
    try {
      await invoke("startOverlayServer", { port });
    } catch (error) {
      console.warn("[OverlaySourceBridge] Failed to start overlay server:", error);
      // If invoke fails (e.g. already started), we'll still try to connect WS.
    }

    this.socket?.close();

    const wsUrl = `ws://127.0.0.1:${port}/ws/overlay?role=source`;
    this.socket = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn("[OverlaySourceBridge] Connection timeout");
        resolve();
      }, 3000);

      const onOpen = () => {
        clearTimeout(timeout);
        resolve();
      };

      const onError = (event: Event) => {
        console.warn("[OverlaySourceBridge] Connection error:", event);
        clearTimeout(timeout);
        resolve(); // don't block UI
      };

      if (!this.socket) {
        console.error("[OverlaySourceBridge] Socket not created");
        resolve();
        return;
      }

      this.socket.onopen = onOpen;
      this.socket.onerror = onError;
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private async attemptReconnect(port: number): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[OverlaySourceBridge] Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    await new Promise((resolve) => setTimeout(resolve, delay));
    await this.ensureConnected(port);
  }

  forwardMessage(message: ChatMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // Attempt to reconnect silently
      if (this.connectedPort) {
        this.ensureConnected(this.connectedPort).catch(() => {});
      }
      return;
    }

    if (!message.canRenderInOverlay || message.text == null) {
      return;
    }

    const payload: OverlaySourcePayload = {
      type: "chatMessage",
      message: {
        id: message.id,
        platform: message.platform,
        author: message.author,
        text: message.text,
        timestamp: message.timestamp,
        isSupporter: message.isSupporter,
        sourceChannelId: message.sourceChannelId,
        authorAvatarUrl: message.authorAvatarUrl,
      },
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch (error) {
      console.error("[OverlaySourceBridge] Failed to send message:", error);
      // Attempt reconnection on send failure
      if (this.connectedPort) {
        this.attemptReconnect(this.connectedPort).catch(() => {});
      }
    }
  }
}
