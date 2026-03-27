import { Injectable, signal } from "@angular/core";
import { WidgetFilter, PlatformType, ChatMessageEmote } from "@models/chat.model";

export interface OverlayChatMessage {
  id: string;
  platform: PlatformType;
  author: string;
  text: string;
  timestamp: string;
  isSupporter: boolean;
  sourceChannelId?: string;
  authorAvatarUrl?: string;
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
    emotes?: ChatMessageEmote[];
  };
}

export interface OverlayConnectOptions {
  port: number;
  widgetId: string;
  filter: WidgetFilter;
  channelIds?: string[];
}

@Injectable({
  providedIn: "root",
})
export class OverlayWsStateService {
  private socket: WebSocket | null = null;
  private currentKey: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000; // 1 second base delay
  private pendingOptions: OverlayConnectOptions | null = null;

  private readonly messagesSignal = signal<OverlayChatMessage[]>([]);
  readonly messages = this.messagesSignal.asReadonly();

  connect(opts: OverlayConnectOptions): void {
    const key = `${opts.port}:${opts.widgetId}:${opts.filter}:${opts.channelIds?.join(",") ?? ""}`;
    if (this.currentKey === key && this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.currentKey = key;
    this.pendingOptions = opts;
    this.messagesSignal.set([]);
    this.reconnectAttempts = 0;

    this.socket?.close();
    const wsUrl = `ws://127.0.0.1:${opts.port}/ws/overlay?widgetId=${encodeURIComponent(
      opts.widgetId
    )}&role=overlay`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
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
        console.error("[OverlayWsState] Failed to parse message:", data);
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
        emotes: parsed.message.emotes,
      };

      this.messagesSignal.update((current) => upsertAndSort(current, msg));
    };

    this.socket.onerror = (event) => {
      console.warn("[OverlayWsState] WebSocket error:", event);
    };

    this.socket.onclose = (event) => {
      console.warn("[OverlayWsState] WebSocket closed:", event.code, event.reason);
      // Attempt to reconnect
      this.attemptReconnect(opts);
    };
  }

  /**
   * Add a message directly (used when polling from backend)
   */
  addMessage(message: OverlayChatMessage): void {
    this.messagesSignal.update((current) => upsertAndSort(current, message));
  }

  private async attemptReconnect(opts: OverlayConnectOptions): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[OverlayWsState] Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    await new Promise((resolve) => setTimeout(resolve, delay));

    // Only reconnect if options haven't changed
    if (this.pendingOptions === opts) {
      this.connect(opts);
    }
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
  next: OverlayChatMessage
): OverlayChatMessage[] {
  const index = current.findIndex((m) => m.id === next.id);
  const merged =
    index === -1 ? [...current, next] : current.map((m) => (m.id === next.id ? next : m));

  return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
