import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ChannelImageLoaderService {
  loadImage(url: string): Promise<string> {
    return Promise.resolve(url);
  }
  preloadImages(urls: string[]): void {}
}
