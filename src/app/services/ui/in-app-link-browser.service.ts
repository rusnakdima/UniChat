import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class InAppLinkBrowserService {
  openLink(url: string): void {}
  openInExternalBrowser(url: string): void {}
  open(url: string): void { this.openLink(url); }
}
