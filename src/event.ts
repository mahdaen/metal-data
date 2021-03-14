export type EventHandler<T> = (event: T) => void;
export type Unsubscribe = () => void;

export interface EventSubscribers<T> {
  [name: string]: EventHandler<T>;
}

export class EventEmitter<T> {
  private _listeners: EventHandler<T>[] = [];
  private _subscribers: EventSubscribers<T> = {};

  /**
   * Emit an event to the subscribers and listeners.
   * @param event - Event data.
   */
  public emit(event: T): void {
    for (const handler of this._listeners) {
      if (typeof handler === 'function') {
        handler(event);
      }
    }

    for (const [, handler] of Object.entries(this._subscribers)) {
      if (typeof handler === 'function') {
        handler(event);
      }
    }
  }

  /**
   * Subscribe to the event.
   * @param name - Subscriber name.
   * @param handler - Function to handle the event.
   */
  public subscribe(name: string, handler: EventHandler<T>): Unsubscribe;
  /**
   * Listen to the event.
   * @param handler - Function to handle the event.
   */
  public subscribe(handler: EventHandler<T>): Unsubscribe;
  public subscribe(nameHandler: string | EventHandler<T>, handler?: EventHandler<T>): Unsubscribe {
    if (typeof nameHandler === 'string' && typeof handler === 'function') {
      this._subscribers[nameHandler] = handler;
      return () => this.unsubscribe(nameHandler);
    } else if (typeof nameHandler === 'function' && !this._listeners.includes(nameHandler)) {
      this._listeners.push(nameHandler);
      return () => this.unsubscribe(nameHandler);
    }
  }

  /**
   * Unsubscribe from the event.
   * @param name - Subscriber name.
   */
  public unsubscribe(name: string): void;
  /**
   * Stop listening from the event.
   * @param handler
   */
  public unsubscribe(handler: EventHandler<T>): void;
  public unsubscribe(nameHandler: string | EventHandler<T>): void {
    if (typeof nameHandler === 'string') {
      delete this._subscribers[nameHandler];
    } else if (typeof nameHandler === 'function') {
      this._listeners.splice(this._listeners.indexOf(nameHandler), 1);
    }
  }

  /**
   * Remove all subscribers and listeners.
   */
  public kick(): void {
    this._listeners = [];
    this._subscribers = {};
  }
}
