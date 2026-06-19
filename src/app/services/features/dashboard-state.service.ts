import { Injectable, signal, computed } from '@angular/core';
import { WidgetConfig } from '@models/chat.model';

export interface DashboardState {
  activeTab: string;
  isGridView: boolean;
  featuredWidget: WidgetConfig | null;
  widgets: WidgetConfig[];
}

@Injectable({ providedIn: 'root' })
export class DashboardStateService {
  private _state = signal<DashboardState>({
    activeTab: 'chat', isGridView: true, featuredWidget: null, widgets: []
  });
  readonly state = this._state.asReadonly();
  readonly featuredWidget = computed(() => this._state().featuredWidget);
  readonly widgets = computed(() => this._state().widgets);

  getState(): DashboardState { return this._state(); }
  setState(state: Partial<DashboardState>): void { this._state.update(s => ({ ...s, ...state })); }
}
