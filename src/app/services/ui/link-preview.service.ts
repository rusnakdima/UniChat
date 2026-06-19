import { Injectable, signal } from '@angular/core';

export interface LinkPreviewState {
  isOpen: boolean;
  url: string | null;
  href?: string;
  displayUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class LinkPreviewService {
  private _state = signal<LinkPreviewState>({ isOpen: false, url: null });
  readonly state = this._state.asReadonly();

  getLinkPreviewIframeSrc(url: string): string { return url; }
  fetchPreview(url: string): Promise<{ url: string; title: string; description: string; image: string }> {
    return Promise.resolve({ url, title: '', description: '', image: '' });
  }
  close(): void { this._state.update(s => ({ ...s, isOpen: false })); }
  openResolved(url: string): void { this._state.update(s => ({ ...s, isOpen: true, url })); }
}
