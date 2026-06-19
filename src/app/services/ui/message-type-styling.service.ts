import { Injectable } from '@angular/core';

export interface MessageTypeConfig {
  color: string;
  bgColor: string;
  icon?: string;
  cssClass?: string;
  tooltip?: string;
  badgeLabel?: string;
  badgeIcon?: string;
  animationClass?: string;
}

@Injectable({ providedIn: 'root' })
export class MessageTypeStylingService {
  getStyleForType(type: string): string { return ''; }
  getMessageTypeConfig(type: string): MessageTypeConfig { return { color: '', bgColor: '' }; }
}
