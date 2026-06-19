import { Injectable, signal } from '@angular/core';

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready';
  progress?: number;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private _status = signal<UpdateStatus>({ state: 'idle' });
  private _errorMessage = signal<string | null>(null);

  readonly status = this._status.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();

  checkForUpdates(): Promise<{ version: string; releaseDate: Date; notes: string } | null> { return Promise.resolve(null); }
  downloadUpdate(): Promise<void> { return Promise.resolve(); }
  getStatus(): UpdateStatus { return this._status(); }
  getErrorMessage(): string | null { return this._errorMessage(); }
  resetStatus(): void { this._status.set({ state: 'idle' }); this._errorMessage.set(null); }
  initialize(): void {}
  getCurrentVersion(): string { return '1.0.0'; }
  getDownloadProgress(): number { return this._status().progress || 0; }
  installUpdate(): void {}
}
