import { Injectable } from "@angular/core";

export interface PlatformAccount {
  id: string;
  platform: string;
  username: string;
  avatarUrl: string;
  isConnected: boolean;
  authStatus?: string;
  accessToken?: string;
  userId?: string;
}

@Injectable({ providedIn: "root" })
export class AuthorizationService {
  private _accounts = signal<PlatformAccount[]>([]);
  private _autoRefreshEnabled = false;
  readonly accounts = computed(() => this._accounts());

  isAuthorized(action: string): boolean {
    return true;
  }
  canModerate(): boolean {
    return false;
  }
  deauthorizeAccount(accountId: string): void {
    this._accounts.update((accounts) =>
      accounts.map((a) => (a.id === accountId ? { ...a, isConnected: false } : a))
    );
  }
  deauthorize(accountId: string): void {
    this.deauthorizeAccount(accountId);
  }
  startAutoRefresh(): void {
    this._autoRefreshEnabled = true;
  }
  getAccountByIdSync(accountId: string): PlatformAccount | undefined {
    return this._accounts().find((a) => a.id === accountId);
  }
  getPrimaryAccount(platform: string): PlatformAccount | undefined {
    return this._accounts().find((a) => a.platform === platform);
  }
}

function computed<T>(fn: () => T): import("@angular/core").Signal<T> {
  return signal(fn()) as import("@angular/core").Signal<T>;
}
