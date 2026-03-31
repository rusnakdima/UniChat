/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
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
  private readonly maxReconnectAttempts = 10; // Increased from 5
  private readonly reconnectDelay = 2000; // Increased from 1000ms
  private connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  private messageQueue: ChatMessage[] = []; // Queue messages when disconnected
  private connectionPromise: Promise<void> | null = null; // Track connection promise

  /**
   * Ensure overlay server is running and WS source connection is open.
   * Safe to call multiple times; connection is re-created only if `port` changes.
   */
  async ensureConnected(port: number): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (!port || !Number.isFinite(port) || port <= 0) {
      return Promise.resolve();
    }

    if (this.connectedPort === port && this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    this.connectedPort = port;
    this.reconnectAttempts = 0;
    this.connectionState = "connecting";

    try {
      await invoke("startOverlayServer", { port });
    } catch {
      // If invoke fails (e.g. already started), we'll still try to connect WS.
    }

    this.socket?.close();

    const wsUrl = `ws://127.0.0.1:${port}/ws/overlay?role=source`;
    this.socket = new WebSocket(wsUrl);

    // Create connection promise
    this.connectionPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.connectionState = "disconnected";
        this.connectionPromise = null;
        resolve();
      }, 3000);

      const onOpen = () => {
        clearTimeout(timeout);
        this.connectionState = "connected";
        this.connectionPromise = null;

        this.flushMessageQueue();
        resolve();
      };

      const onError = () => {
        this.connectionState = "disconnected";
        this.connectionPromise = null;
        clearTimeout(timeout);
        resolve();
      };

      if (!this.socket) {
        this.connectionPromise = null;
        resolve();
        return;
      }

      this.socket.onopen = onOpen;
      this.socket.onerror = onError;
    });

    return this.connectionPromise;
  }

  /**
   * Flush queued messages after connection is established
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      this.sendWebSocketMessage(message);
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private async attemptReconnect(port: number): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    await new Promise((resolve) => setTimeout(resolve, delay));
    await this.ensureConnected(port);
  }

  /**
   * Forward a chat message to overlay via WebSocket
   */
  forwardMessage(message: ChatMessage): void {
    if (!message.canRenderInOverlay || message.text == null) {
      return;
    }

    // If socket is open, send immediately
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendWebSocketMessage(message);
      return;
    }

    this.messageQueue.push(message);

    if (this.messageQueue.length > 50) {
      this.messageQueue.shift();
    }

    if (this.connectedPort) {
      this.ensureConnected(this.connectedPort).catch(() => undefined);
    }
  }

  /**
   * Send a message via WebSocket
   */
  private sendWebSocketMessage(message: ChatMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
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
      const json = JSON.stringify(payload);
      this.socket.send(json);
    } catch {
      // Queue message for retry
      this.messageQueue.push(message);
      if (this.messageQueue.length > 50) {
        this.messageQueue.shift();
      }
      // Attempt reconnection on send failure
      if (this.connectedPort) {
        this.attemptReconnect(this.connectedPort).catch(() => {});
      }
    }
  }
}
