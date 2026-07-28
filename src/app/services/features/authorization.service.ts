import type { PlatformAccount } from '@entities/chat.model';

export class AuthorizationService {
  private _accountsMap = new Map<string, PlatformAccount>();
  private _accountsSignal: { value: PlatformAccount[]; set: (v: PlatformAccount[]) => void } = {
    value: [],
    set: (v: PlatformAccount[]) => {
      this._accountsMap.clear();
      v.forEach(acc => this._accountsMap.set(acc.id, acc));
      this._accountsSignal.value = v;
    }
  };

  isAuthorized(_action: string): boolean {
    return true;
  }

  canModerate(): boolean {
    return false;
  }

  getAccountByIdSync(id: string): PlatformAccount | undefined {
    const account = this._accountsMap.get(id);
    return account;
  }

  getPrimaryAccount(platform: string): PlatformAccount | undefined {
    for (const account of this._accountsMap.values()) {
      if (account.platform === platform) {
        return account;
      }
    }
    return undefined;
  }

  async deauthorizeAccount(accountId: string): Promise<void> {
    this._accountsMap.delete(accountId);
    this._accountsSignal.value = Array.from(this._accountsMap.values());
  }

  async authorize(platform: string): Promise<void> {}
  async loadAccountStatus(platform: string): Promise<void> {}
  async loadAllAccountStatuses(): Promise<void> {}

  get _accounts(): typeof this._accountsSignal {
    return this._accountsSignal;
  }

  get accounts(): PlatformAccount[] {
    return this._accountsSignal.value;
  }

  deauthorize(accountId: string): void {
    this.deauthorizeAccount(accountId);
  }
}
