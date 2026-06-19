import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MemoryManagementService {
  readonly memoryUsage = 0;
  readonly warningThreshold = 0.8;
  readonly criticalThreshold = 0.95;

  private _autoPruneEnabled = false;

  startAutoPrune(intervalMs: number): void {
    this._autoPruneEnabled = true;
  }

  stopAutoPrune(): void {
    this._autoPruneEnabled = false;
  }
}
