/* sys lib */
import { Injectable, OnDestroy, inject } from "@angular/core";

/* models */
import { ChatMessage, PlatformType } from "@models/chat.model";
import { ReconnectionManager } from "@utils/reconnection-manager.util";
import { LoggerService } from "@services/core/logger.service";
import { TauriApiService } from "@app/api/tauri-api.service";
import { POLLING_INTERVAL_MS } from "@app/shared/utils/constants";
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
    channelImageUrl?: string;
  };
};

@Injectable({
  providedIn: "root",
})
export class OverlaySourceBridgeService implements OnDestroy {
  private readonly logger = inject(LoggerService);
  private readonly tauriApi = inject(TauriApiService);
  private socket: WebSocket | null = null;
  private connectedPort: number | null = null;
  private readonly reconnectionManager = new ReconnectionManager({
    maxRetries: 10,
    baseDelayMs: POLLING_INTERVAL_MS,
    maxDelayMs: 30000,
  });
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
    this.reconnectionManager.onSuccessfulConnection();
    this.connectionState = "connecting";

    try {
      await this.tauriApi.invoke("startOverlayServer", { port }, { suppressError: true });
    } catch {
      // If invoke fails (e.g. already started), we'll still try to connect WS.
    }

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }

    const wsUrl = `ws://127.0.0.1:${port}/ws/overlay?role=source`;
    this.socket = new WebSocket(wsUrl);

    // Create connection promise
    this.connectionPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.connectionState = "disconnected";
        this.connectionPromise = null;
        // Flush the message queue before clearing it
        this.flushMessageQueue();
        resolve();
      }, 3000);

      const onOpen = () => {
        clearTimeout(timeout);
        this.connectionState = "connected";
        this.connectionPromise = null;
        // Flush the message queue before clearing it
        this.flushMessageQueue();

        this.flushMessageQueue();
        resolve();
      };

      const onError = () => {
        this.connectionState = "disconnected";
        this.connectionPromise = null;
        // Flush the message queue before clearing it
        this.flushMessageQueue();
        clearTimeout(timeout);
        resolve();
      };

      if (!this.socket) {
        this.connectionPromise = null;
        // Flush the message queue before clearing it
        this.flushMessageQueue();
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
    if (!this.reconnectionManager.shouldRetry()) {
      return;
    }

    const delay = this.reconnectionManager.onConnectionFailed();

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
   * Send a custom event to overlay via WebSocket
   */
  sendEvent(event: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        const json = JSON.stringify(event);
        this.socket.send(json);
      } catch {
        // Silently fail for custom events
      }
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
        channelImageUrl: message.channelImageUrl,
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
        this.attemptReconnect(this.connectedPort).catch((error) => {
          this.logger.warn("[OverlaySourceBridge] Reconnection attempt failed:", error);
        });
      }
    }
  }

  close(): void {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.connectionState = "disconnected";
    this.connectionPromise = null;
    // Flush the message queue before clearing it
    this.flushMessageQueue();
    this.messageQueue = [];
  }

  ngOnDestroy(): void {
    this.close();
  }
}
