import { Injectable, signal, computed } from "@angular/core";

export type EventCallback<T = unknown> = (data: T) => void;

interface EventSubscription {
  id: string;
  callback: EventCallback;
  once: boolean;
}

@Injectable({
  providedIn: "root",
})
export class EventBusService {
  private readonly events = signal<Map<string, EventSubscription[]>>(new Map());

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    return this.subscribe(event, callback, false);
  }

  once<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    return this.subscribe(event, callback, true);
  }

  private subscribe<T>(event: string, callback: EventCallback<T>, once: boolean): () => void {
    const id = this.generateId();
    const subscription: EventSubscription = { id, callback: callback as EventCallback, once };

    this.events.update((map) => {
      const newMap = new Map(map);
      const existing = newMap.get(event) ?? [];
      newMap.set(event, [...existing, subscription]);
      return newMap;
    });

    return () => this.unsubscribe(event, id);
  }

  emit<T = unknown>(event: string, data?: T): void {
    const subscriptions = this.events().get(event) ?? [];
    const toRemove: string[] = [];

    for (const sub of subscriptions) {
      sub.callback(data);
      if (sub.once) {
        toRemove.push(sub.id);
      }
    }

    if (toRemove.length > 0) {
      this.events.update((map) => {
        const newMap = new Map(map);
        newMap.set(
          event,
          subscriptions.filter((s: EventSubscription) => !toRemove.includes(s.id))
        );
        return newMap;
      });
    }
  }

  unsubscribe(event: string, id: string): void {
    this.events.update((map) => {
      const newMap = new Map(map);
      const existing = newMap.get(event) ?? [];
      newMap.set(
        event,
        existing.filter((s) => s.id !== id)
      );
      return newMap;
    });
  }

  clear(event?: string): void {
    if (event) {
      this.events.update((map) => {
        const newMap = new Map(map);
        newMap.delete(event);
        return newMap;
      });
    } else {
      this.events.set(new Map());
    }
  }
}
