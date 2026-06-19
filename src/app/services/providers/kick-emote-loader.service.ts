import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class KickEmoteLoaderService {
  loadEmotes(channelId: string): Promise<unknown[]> { return Promise.resolve([]); }
  fetchChannelEmotes(channelId: string): Promise<unknown[]> { return this.loadEmotes(channelId); }
}
