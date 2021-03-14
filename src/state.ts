import * as localforage from 'localforage';
import * as _ from 'lodash';
import { EventEmitter } from './event';
import { PartialState } from './interface';

localforage.config({
  name: 'metal-data',
  storeName: 'states',
  description: 'Metal Data state storage.'
});

declare var window: {
  MetalStateStore: MetalStateStore;
  localForage: LocalForage;
};

const storageKey = 'metal-states';
let browserState = localStorage.getItem(storageKey) || '{}';

export class MetalStateStore {
  public states: {
    [name: string]: MetalState<any>;
  } = {};
  public stores: {
    [name: string]: MetalState<any>;
  } = {};

  public syncStatus: 'sync' | 'idle' | 'stopped';
  public storeStatus: 'ready' | 'init' | 'sync';
  public storeStatusChange = new EventEmitter();
  private syncTimeout: number;

  public get<T extends object>(name: string, seed?: T): MetalState<T> {
    if (!this.states[name]) {
      this.states[name] = new MetalState<T>(name, seed);
    }

    return this.states[name];
  }

  public persistent<T extends object>(name: string, seed?: T): MetalState<T> {
    if (!this.states[name]) {
      this.states[name] = new MetalState<T>(name, seed);
      this.states[name].persistent = 'local';
    }

    return this.states[name];
  }

  public rem(name: string): void {
    delete this.states[name];
  }

  public write(): this {
    const states = {};
    for (const [name, state] of Object.entries(this.states)) {
      if (state.persistent) {
        states[name] = state.data;
      }
    }

    try {
      const encoded = JSON.stringify(states);
      if (encoded !== browserState) {
        browserState = encoded;
        localStorage.setItem(storageKey, browserState);
      }
    } catch (error) {
      this.syncStatus = 'stopped';
      console.error('State synchronization stopped because there is an error when writing the states to local storage.');
      throw error;
    }

    return this;
  }

  public read(): this {
    const states = JSON.parse(browserState);
    for (const [name, data] of Object.entries(states)) {
      if (!this.states[name]) {
        this.states[name] = new MetalState<any>(name, data);
        this.states[name].persistent = 'local';
      }
    }

    return this;
  }

  public startSync(timeout?: number) {
    this.syncStatus = 'sync';

    clearTimeout(this.syncTimeout);
    this.write();

    this.syncTimeout = setTimeout(() => {
      if (this.syncStatus !== 'stopped') {
        this.startSync();
      }
    }, timeout || 100) as any;

    this.syncStatus = 'idle';
  }

  public stopSync() {
    this.syncStatus = 'stopped';
  }

  public store<T extends object>(name: string, seed?: T): MetalState<T> {
    if (!this.stores[name]) {
      this.stores[name] = new MetalState<T>(name, seed);
      this.stores[name].persistent = 'db';
      this.writeStore(name);
    }

    return this.stores[name];
  }

  public writeStore(name?: string) {
    if (name) {
      if (this.stores[name]) {
        localforage.setItem(name, this.stores[name].data).catch(error => {
          console.error(`Unable to store state: ${name}.`);
          console.error(error);
        });
      }
    } else {
      for (const [key, state] of Object.entries(this.stores)) {
        localforage.setItem(key, state.data).catch(error => {
          console.error(`Unable to store state: ${key}.`);
          console.error(error);
        });
      }
    }
  }

  public async readStore() {
    this.storeStatus = 'init';

    try {
      const result = await localforage.iterate((data, name) => {
        if (!this.stores[name]) {
          this.stores[name] = new MetalState<any>(name, data);
          this.stores[name].persistent = 'db';
        }
      });

      this.storeStatus = 'ready';
      this.storeStatusChange.emit(this.storeStatus);
      return result;
    } catch (error) {
      this.storeStatus = 'ready';
      this.storeStatusChange.emit(this.storeStatus);
      console.error('Unable to initialize state store.');
      console.error(error);
    }
  }
}

export class MetalState<T extends object> {
  public data: T;
  public dataChanges: EventEmitter<T> = new EventEmitter<T>();
  public persistent: 'local' | 'db';

  constructor(public name: string, data?: T) {
    this.data = data || {} as T;
  }

  public set(data: T): this {
    this.data = data;
    this.dataChanges.emit(this.data);

    if (this.persistent === 'local') {
      StateStore.write();
    }
    if (this.persistent === 'db') {
      StateStore.writeStore(this.name);
    }

    return this;
  }

  public put(key: string, value: any): this;
  public put(data: PartialState<T>, value?: any): this;
  public put(keyData: string | PartialState<T>, value?: any): this {
    if (typeof keyData === 'string') {
      _.set(this.data, keyData, value);
    } else {
      _.merge(this.data, keyData);
    }

    if (this.persistent === 'local') {
      StateStore.write();
    }
    if (this.persistent === 'db') {
      StateStore.writeStore(this.name);
    }

    this.dataChanges.emit(this.data);
    return this;
  }

  public get<V>(key: string): V {
    return _.get(this.data, key);
  }
}

if (!window.MetalStateStore) {
  window.MetalStateStore = new MetalStateStore();
}

export const StateStore = window.MetalStateStore;
StateStore.read().startSync();

export function State<T extends object>(name: string, seed?: T) {
  return function(constructor: object, key: string) {
    let state: T;

    Object.defineProperty(constructor, key, {
      get() {
        if (!state) {
          state = StateStore.get(name, seed).data;
        }

        return state;
      }
    });
  };
}

export function Persistent<T extends object>(name: string, seed?: T) {
  return function(constructor: object, key: string) {
    let state: T;

    Object.defineProperty(constructor, key, {
      get() {
        if (!state) {
          state = StateStore.persistent(name, seed).data;
        }

        return state;
      }
    });
  };
}

export function Store<T extends object>(name: string, seed?: T) {
  return function(constructor: object, key: string) {
    let state: T;

    Object.defineProperty(constructor, key, {
      get() {
        if (!state) {
          state = StateStore.store(name, seed).data;
        }

        return state;
      }
    });
  };
}

window.localForage = localforage;
