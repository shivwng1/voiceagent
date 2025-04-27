export interface EventTypes {}
export type EventListener<T> = (event: T) => void;

export abstract class EventEmitter<T extends EventTypes = EventTypes> {
  private listeners: Map<keyof T, EventListener<any>[]> = new Map();

  // Add event listener
  public on<K extends keyof T>(type: K, listener: EventListener<T[K]>) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
    const unSubscribe = () => {
      listeners.splice(listeners.indexOf(listener), 1);
    };
    return unSubscribe;
  }

  // Emit event
  protected emit<K extends keyof T>(type: K, event?: T[K]): void {
    if (this.listeners.has(type)) {
      const listeners = this.listeners.get(type)!;
      listeners.forEach((listener) => listener(event));
    }
  }

  public addEventListener = this.on;
  public dispatchEvent = this.emit;
}
