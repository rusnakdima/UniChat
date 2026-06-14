/* sys lib */
import { Injectable, OnDestroy, signal } from "@angular/core";

/* models */
import { WidgetFilter, PlatformType, ChatMessageEmote } from "@models/chat.model";
import { ReconnectionManager } from "@utils/reconnection-manager.util";
import { POLLING_INTERVAL_MS, RECONNECTION_MAX_DELAY_MS } from "@shared/utils/constants";
export interface OverlayChatMessage {
  id: string;
  platform: PlatformType;
  author: string;
  text: string;
  timestamp: string;
  isSupporter: boolean;
  sourceChannelId?: string;
  authorAvatarUrl?: string;
  channelImageUrl?: string; // Channel profile image for multi-channel overlays
  emotes?: ChatMessageEmote[];
}

interface OverlayWsOverlayMessageEnvelope {
  type: string;
  message?: {
    id: string;
    platform: string;
    author: string;
    text: string;
    timestamp: string;
    isSupporter: boolean;
    sourceChannelId?: string;
    authorAvatarUrl?: string;
    channelImageUrl?: string;
    emotes?: ChatMessageEmote[];
  };
}

export interface OverlayConnectOptions {
  port: number;
  widgetId: string;
  filter: WidgetFilter;
  channelIds?: string[];
  preserveMessages?: boolean; // If true, keep existing messages on reconnect
  maxMessages?: number;
}

@Injectable({
  providedIn: "root",
})
export class OverlayWsStateService implements OnDestroy {
  private socket: WebSocket | null = null;
  private currentKey: string | null = null;
  private readonly reconnectionManager = new ReconnectionManager({
    maxRetries: 10,
    baseDelayMs: POLLING_INTERVAL_MS,
    maxDelayMs: RECONNECTION_MAX_DELAY_MS,
  });
  private pendingOptions: OverlayConnectOptions | null = null;
  private connectionState: "disconnected" | "connecting" | "connected" = "disconnected";
  private destroyed = false;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly messagesSignal = signal<OverlayChatMessage[]>([]);
  readonly messages = this.messagesSignal.asReadonly();
  private maxQueueSize = 0;

  connect(opts: OverlayConnectOptions): void {
    this.maxQueueSize = opts.maxMessages ?? 0;

    const key = `${opts.port}:${opts.widgetId}:${opts.filter}:${opts.channelIds?.join(",") ?? ""}`;
    if (this.currentKey === key && this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }

    this.currentKey = key;
    this.pendingOptions = opts;

    // Only clear messages on initial connect, not on automatic reconnection
    // This prevents messages from disappearing during brief network issues
    const shouldPreserveMessages =
      opts.preserveMessages ?? this.reconnectionManager.getState().attempts > 0;
    if (!shouldPreserveMessages) {
      this.messagesSignal.set([]);
    }

    this.reconnectionManager.onSuccessfulConnection();
    this.connectionState = "connecting";

    const wsUrl = `ws://127.0.0.1:${opts.port}/ws/overlay?widgetId=${encodeURIComponent(
      opts.widgetId
    )}&role=overlay`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.connectionState = "connected";
      const subscribe = {
        type: "subscribe",
        subscribe: {
          widgetId: opts.widgetId,
          filter: opts.filter,
          channelIds: opts.channelIds,
        },
      };
      this.socket?.send(JSON.stringify(subscribe));
    };

    this.socket.onmessage = (ev) => {
      const data = ev.data;
      if (typeof data !== "string") {
        return;
      }

      let parsed: OverlayWsOverlayMessageEnvelope;
      try {
        parsed = JSON.parse(data) as OverlayWsOverlayMessageEnvelope;
      } catch {
        return;
      }

      if (parsed.type !== "overlayMessage" || !parsed.message) {
        return;
      }

      const msg: OverlayChatMessage = {
        id: parsed.message.id,
        platform: toPlatformType(parsed.message.platform),
        author: parsed.message.author,
        text: parsed.message.text,
        timestamp: parsed.message.timestamp,
        isSupporter: !!parsed.message.isSupporter,
        sourceChannelId: parsed.message.sourceChannelId,
        authorAvatarUrl: parsed.message.authorAvatarUrl,
        channelImageUrl: parsed.message.channelImageUrl,
        emotes: parsed.message.emotes,
      };

      this.messagesSignal.update((current) => upsertAndSort(current, msg, this.maxQueueSize));
    };

    this.socket.onerror = () => {
      this.connectionState = "disconnected";
    };

    this.socket.onclose = () => {
      this.connectionState = "disconnected";
      // Attempt to reconnect
      this.attemptReconnect(opts);
    };
  }

  /**
   * Add a message directly (used when polling from backend)
   */
  addMessage(message: OverlayChatMessage): void {
    this.messagesSignal.update((current) => upsertAndSort(current, message, this.maxQueueSize));
  }

  /**
   * Set messages directly (used when polling from backend)
   */
  setMessages(messages: OverlayChatMessage[]): void {
    const sorted = [...messages].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    this.messagesSignal.set(this.maxQueueSize > 0 ? sorted.slice(0, this.maxQueueSize) : sorted);
  }

  private async attemptReconnect(opts: OverlayConnectOptions): Promise<void> {
    if (!this.reconnectionManager.shouldRetry() || this.destroyed) {
      return;
    }

    // Don't reconnect if connection state changed (user navigated away, etc)
    if (this.pendingOptions !== opts) {
      return;
    }

    const delay = this.reconnectionManager.onConnectionFailed();

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      // Check again after delay
      if (this.pendingOptions === opts && !this.destroyed) {
        this.connect(opts);
      }
    }, delay);
  }

  close(): void {
    this.destroyed = true;
    this.pendingOptions = null;
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  ngOnDestroy(): void {
    this.close();
  }
}

function toPlatformType(platform: string): PlatformType {
  const p = platform.toLowerCase();
  if (p === "twitch" || p === "kick" || p === "youtube") {
    return p;
  }
  return "twitch";
}

function upsertAndSort(
  current: OverlayChatMessage[],
  next: OverlayChatMessage,
  maxQueueSize: number
): OverlayChatMessage[] {
  const index = current.findIndex((m) => m.id === next.id);
  const merged =
    index === -1 ? [...current, next] : current.map((m) => (m.id === next.id ? next : m));

  const sorted = merged.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return maxQueueSize > 0 ? sorted.slice(0, maxQueueSize) : sorted;
}
