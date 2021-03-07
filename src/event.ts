export type EventHandler<T> = (event: T) => void;
export type Unsubscribe = () => void;

export interface EventSubscribers<T> {
  [name: string]: EventHandler<T>;
}

export class EventEmitter<T> {
  _listeners: EventHandler<T>[] = [];
  _subscribers: EventSubscribers<T> = {};

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

  public subscribe(name: string, handler: EventHandler<T>): Unsubscribe;
  public subscribe(handler: EventHandler<T>): Unsubscribe;
  public subscribe(nameHandler: string | EventHandler<T>, handler?: EventHandler<T>): Unsubscribe {
    if (Array.isArray(this._listeners)) {
      if (typeof nameHandler === 'string' && typeof handler === 'function') {
        this._subscribers[nameHandler] = handler;
      } else if (typeof nameHandler === 'function' && !this._listeners.includes(nameHandler)) {
        this._listeners.push(nameHandler);
      }

      return () => this.unsubscribe(nameHandler);
    }
  }

  public unsubscribe(nameHandler: string | EventHandler<T>): void {
    if (Array.isArray(this._listeners)) {
      if (typeof nameHandler === 'string') {
        delete this._subscribers[nameHandler];
      } else if (typeof nameHandler === 'function') {
        this._listeners.splice(this._listeners.indexOf(nameHandler), 1);
      }
    }
  }

  public kick(): void {
    this._listeners = [];
    this._subscribers = {};
  }
}
