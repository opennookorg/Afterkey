import type { LifecycleEventType } from "../types.js";

type EventHandler = (event: { connectionId: string; type: LifecycleEventType; reason: string | null }) => void;

export class EventEmitter {
  private handlers = new Map<string, Set<EventHandler>>();

  on(type: LifecycleEventType | "*", handler: EventHandler) {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
    return () => set.delete(handler);
  }

  emit(connectionId: string, type: LifecycleEventType, reason: string | null = null) {
    const event = { connectionId, type, reason };
    this.handlers.get(type)?.forEach((h) => h(event));
    this.handlers.get("*")?.forEach((h) => h(event));
  }
}
