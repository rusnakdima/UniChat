import { Injectable, signal } from "@angular/core";

export interface ConnectionInfo {
  channelId: string;
  platform: string;
  status: "connected" | "disconnected" | "connecting" | "error";
  error?: string;
  isRecoverable?: boolean;
  port?: string;
}

@Injectable({ providedIn: "root" })
export class ConnectionStateService {
  private _connections = new Map<string, ConnectionInfo>();
  private _connectionsSignal = signal<ConnectionInfo[]>([]);
  private _state = signal<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  private _lastError = signal<string | null>(null);

  get state(): "disconnected" | "connecting" | "connected" | "error" {
    return this._state();
  }
  get lastError(): string | null {
    return this._lastError();
  }
  get hasError(): boolean {
    return this._lastError() !== null;
  }
  getConnections(): ConnectionInfo[] {
    return Array.from(this._connections.values());
  }

  connectionsSignal() {
    return this._connectionsSignal();
  }

  connect(): void {
    this._state.set("connecting");
  }
  disconnect(): void {
    this._state.set("disconnected");
    this._connections.clear();
  }
  clearError(channelId?: string): void {
    if (channelId) {
      const conn = this._connections.get(channelId);
      if (conn) {
        conn.error = undefined;
        conn.isRecoverable = undefined;
      }
    }
    this._lastError.set(null);
    this._state.set("disconnected");
  }
  getChannelError(channelId: string): string | null {
    return this._connections.get(channelId)?.error || null;
  }
  getRoomState(channelId: string): ConnectionInfo | undefined {
    return this._connections.get(channelId);
  }
}
