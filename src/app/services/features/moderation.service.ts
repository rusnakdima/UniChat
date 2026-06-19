import { Injectable } from '@angular/core';

export interface ModerationAction {
  type: 'timeout' | 'ban' | 'warn' | 'delete';
  targetUserId: string;
  reason?: string;
  duration?: number;
}

export const DEFAULT_MODERATION_MACROS: Record<string, string> = {
  spam: 'No spam please',
  offensive: 'Please be respectful',
};

@Injectable({ providedIn: 'root' })
export class ModerationService {
  private _log: ModerationAction[] = [];

  takeAction(action: ModerationAction): void { this._log.push(action); }
  getModerationLog(): ModerationAction[] { return [...this._log]; }
  canModerate(): boolean { return true; }
  executeMacro(macroName: string, targetUserId: string): void {
    const message = DEFAULT_MODERATION_MACROS[macroName];
    if (message) this.takeAction({ type: 'warn', targetUserId, reason: message });
  }
  getMacrosForPlatform(platform: string): Record<string, string> { return DEFAULT_MODERATION_MACROS; }
}
