import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ChatProviderCoordinatorService {
  private _activeProviders = new Set<string>();

  get activeProviders(): string[] {
    return Array.from(this._activeProviders);
  }

  registerProvider(name: string): void {
    this._activeProviders.add(name);
  }

  unregisterProvider(name: string): void {
    this._activeProviders.delete(name);
  }

  connectChannel(channelId: string, platform: string): void {}
}
