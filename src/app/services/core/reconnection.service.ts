import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ReconnectionService {
  private _isReconnecting = false;
  private _reconnectAttempt = 0;
  private _gapCleared = new Set<string>();
  private _missedCounts = new Map<string, number>();
  private _gapCallbacks = new Map<string, () => void>();

  get isReconnecting(): boolean {
    return this._isReconnecting;
  }
  get reconnectAttempt(): number {
    return this._reconnectAttempt;
  }

  initiateReconnection(): void {
    this._isReconnecting = true;
    this._reconnectAttempt++;
  }

  clearGap(gapId: string): void {
    this._gapCleared.add(gapId);
  }

  hasGap(gapId: string): boolean {
    return !this._gapCleared.has(gapId);
  }

  getMissedCount(gapId: string): number {
    return this._missedCounts.get(gapId) || 0;
  }

  onGap(gapId: string, callback: () => void): void {
    this._gapCallbacks.set(gapId, callback);
  }
}
