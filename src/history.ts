import * as _ from 'lodash';
import { PartialState } from './interface';
import { StateStore } from './state';
import { diff } from './utils/diff';

export interface MetalHistoryCache<T> {
  prev: PartialState<T>[];
  data: T;
  next: PartialState<T>[];
}

/**
 * A simple Object History to manage the data changes. The changes will be cached to the memory and IndexedDB,
 * so we can keep the changes if we leave the form or even if we close the browser.
 */
export class MetalHistory<T> {
  /** A changes list to undo the data changes. **/
  public prev: PartialState<T>[] = [];
  /** A changes list to redo the data changes. **/
  public next: PartialState<T>[] = [];
  /** An identifier to describe the cache location. **/
  public href: string;

  /** A mirrored data to check the changes **/
  private _mirror: T;
  /** The initial data that will never changed **/
  private readonly _origin: T;

  /**
   * A key-value pairs of the changed data.
   */
  public get changes(): PartialState<T> {
    return diff(this._mirror, this.data);
  }

  /**
   * Check does the data is changed.
   */
  public get hasChanges(): boolean {
    return Object.keys(this.changes).length > 0;
  }

  /**
   * @param name - History name to describe the identifier.
   * @param data - History data to describe the initial state.
   */
  constructor(public name: string,
              public data: T = {} as T) {
    this.href = `history://${name}`;
    this._mirror = JSON.parse(JSON.stringify(data));
    this._origin = JSON.parse(JSON.stringify(data));
    this.unStash();
  }

  /**
   * Load history data from the cache.
   */
  public unStash(): this {
    Object.assign(this, StateStore.store(this.href).data);
    Object.assign(this, StateStore.get(this.href).data);

    return this;
  }

  /**
   * Write history data to the cache.
   */
  public stash(): this {
    const { prev, data, next } = this;

    StateStore.store<MetalHistoryCache<T>>(this.href).set({ prev, data, next });
    StateStore.get<MetalHistoryCache<T>>(this.href).set({ prev, data, next });

    return this;
  }

  /**
   * Undo the changes from the last prev changes list.
   */
  public undo(): this {
    if (this.prev.length) {
      const prev = this.prev.pop();
      _.merge(this.data, prev);
      this.next.splice(0, 0, prev);
      this._remember();
    }

    return this;
  }

  /**
   * Save the changes to the undo changes list.
   */
  public save(): this {
    if (this.hasChanges) {
      this.prev.push(JSON.parse(JSON.stringify(this.changes)));
      this.next = [];
      this._remember();
    }

    return this;
  }

  /**
   * Redo the changes from the first next changes list.
   */
  public redo(): this {
    if (this.next.length) {
      const next = this.next.shift();
      _.merge(this.data, next);
      this.prev.push(next);
      this._remember();
    }

    return this;
  }

  /**
   * Revert the history data to the initial state.
   */
  public clear(): this {
    this.prev = [];
    this.next = [];
    this.data = JSON.parse(JSON.stringify(this._origin));
    this._remember();
    return this;
  }

  /**
   * Update the mirror and stash the history data.
   * @private
   */
  private _remember(): void {
    this.stash();
    this._mirror = JSON.parse(JSON.stringify(this.data));
  }
}
