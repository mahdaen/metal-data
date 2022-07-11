import * as _ from 'lodash';
import { Subscription } from 'metal-event-client';
import { MetalCollection } from './collection';
import { EventEmitter } from './event';
import {
  Fields,
  KeyOf,
  MetalData,
  MetalFindOptions,
  MetalPartialData,
  MetalRecordState,
  MetalRequestOptions,
  MetalRequestParams
} from './interface';
import { MetalPath } from './path';
import { MetalQuery } from './query';
import { MetalTransactionError } from './request';
import { MetalState, StateStore } from './state';
import { diff } from './utils/diff';
import { sleep } from './utils/sleep';

/**
 * A special class with a sets of helper methods to manage a single record.
 */
export class MetalRecord<T extends MetalData, C extends MetalCollection<T> = MetalCollection<T>> {
  /** History reference path **/
  public href: string;
  /** Changes reference path **/
  public cref: string;
  /** Form reference path **/
  public fref?: string;
  public path: MetalPath;
  /** Mirrored data to check the changes **/
  public mirror: T;
  /** Property to mark the record as deleted **/
  public deleted: boolean;

  /** Parent query reference **/
  public query?: MetalQuery<T>;

  /** Property to mark the record status **/
  public status: MetalRecordState = 'init';
  /** Property to mark the record data initialization. **/
  public initialized = false;
  /**
   * An Event Emitter instance to subscribe when the record state changed.
   */
  public statusChange: EventEmitter<MetalRecordState> = new EventEmitter<MetalRecordState>();
  public dataChange: EventEmitter<T> = new EventEmitter<T>();

  /** Property to store the errors **/
  public error: MetalTransactionError<T>;
  /**
   * An Event Emitter instance to subscribe when an error happened.
   */
  public errorChange: EventEmitter<MetalTransactionError<T>> = new EventEmitter<MetalTransactionError<T>>();
  public subscription: Subscription<T>;

  public selectionChange: EventEmitter<boolean> = new EventEmitter<boolean>();

  public get selected(): boolean {
    return this._selected;
  }

  /** Property to mark the record as selected **/
  public set selected(selected: boolean) {
    this._selected = selected;
    this.selectionChange.emit(this._selected);

    if (this.query) {
      this.query.selectionChange.emit(this);
    }
  }

  private _selected: boolean;

  /**
   * Get the changed properties.
   */
  public get changes(): MetalPartialData<T> {
    return diff(this.mirror, this.data);
  }

  /**
   * Check does the record has any changes.
   */
  public get hasChanges(): boolean {
    return Object.keys(this.changes || {}).length > 0;
  }

  private _options: MetalFindOptions<T> = {};
  private _cached = false;

  /**
   * A record construction.
   * @param collection - The parent collection to manage the record.
   * @param id - Record ID.
   * @param data - The record data.
   */
  constructor(public collection: C,
              public id: string,
              public data: T = {} as T) {
    this.href = `${collection.href}/${id}`;
    this.cref = `${this.href}/changes`;
    this.path = new MetalPath(this);

    if (data.id) {
      this.status = 'ready';
      this.initialized = true;
    }

    this.mirror = JSON.parse(JSON.stringify(id ? data : {}));
  }

  /**
   * Initialize the record data.
   */
  public init(): this {
    this._cached = true;
    this._loadCaches();
    this.unStash();
    return this;
  }

  private _sync(): void {
    this.status = 'sync';
    this.statusChange.emit(this.status);
  }

  private _ready(): void {
    this.status = 'ready';
    this.statusChange.emit(this.status);
  }

  private _throw(error: MetalTransactionError<T>): void {
    this._ready();
    this.error = error;
    this.errorChange.emit(error);

    throw error;
  }

  /**
   * Load record data State.
   * @private
   */
  private _loadCaches(): void {
    const { persistentCache, memoryCache } = this.collection.configs;

    if (persistentCache) {
      this._applyCache(StateStore.store(this.href));
    }

    if (memoryCache) {
      this._applyCache(StateStore.get(this.href));
    }
  }

  /**
   * Write record data into State.
   * @private
   */
  private _writeCache(): void {
    if (!this._cached) {
      return;
    }

    const { persistentCache, memoryCache } = this.collection.configs;

    if (persistentCache) {
      StateStore.store(this.href).set(this.data);
    }

    if (memoryCache) {
      StateStore.get(this.href).set(this.data);
    }
  }

  /**
   * Apply data from a State.
   * @param fromState
   * @private
   */
  private _applyCache(fromState: MetalState<T>): void {
    if (!this.initialized) {
      if (fromState.data.id) {
        this.assign(fromState.data);

        this.initialized = true;
        this._ready();
      }
    }
  }

  /**
   * Apply the changed data from cache.
   */
  public unStash(): this {
    const { persistentCache, memoryCache } = this.collection.configs;

    if (persistentCache) {
      this.set(StateStore.store(this.cref).data);
    }

    if (memoryCache) {
      this.set(StateStore.get(this.cref).data);
    }

    return this;
  }

  /**
   * Save the changed data into cache.
   */
  public stash(): this {
    if (!this._cached) {
      return this;
    }

    const { persistentCache, memoryCache } = this.collection.configs;

    if (persistentCache) {
      StateStore.store(this.cref).set(this.changes);
    }

    if (memoryCache) {
      StateStore.get(this.cref).set(this.changes);
    }

    return this;
  }

  /**
   * Assign a new data to the existing data. All changes will be reset.
   * @param data - Data to be applied.
   */
  public assign(data: T): this {
    this.mirror = JSON.parse(JSON.stringify(data));
    Object.assign(this.data, data);
    this.dataChange.emit(this.data);
    this._writeCache();
    this.stash();

    return this;
  }

  /**
   * Reset the data to the initial state.
   */
  public reset(): this {
    if (this.fref) {
      this.collection.removeForm(this.fref);
    }

    this.data = JSON.parse(JSON.stringify(this.mirror));
    this.dataChange.emit(this.data);
    this._writeCache();
    this.stash();
    return this;
  }

  public set(key: string, value: any): this;
  public set(data: MetalPartialData<T>): this;
  /**
   * Apply new changes to the data. Data changed using this method is temporary and wont be cached.
   * @param keyData - Property name, or partial data. If the argument is an object, merge will be used.
   * @param value - Property value, required if the first argument is a string.
   */
  public set(keyData: string | MetalPartialData<T>, value?: any): this {
    if (typeof keyData === 'string') {
      _.set(this.data, keyData, value);
    } else {
      _.merge(this.data, keyData);
    }

    this.dataChange.emit(this.data);
    this.stash();
    return this;
  }

  public option(key: KeyOf<MetalFindOptions<T>>, value: any): this;
  public option(options: MetalFindOptions<T>): this;
  public option(keyOptions: KeyOf<MetalFindOptions<T>> | MetalFindOptions<T>, value?: any): this {
    if (typeof keyOptions === 'string') {
      _.set(this._options, keyOptions, value);
    } else {
      this._options = keyOptions;
    }

    return this;
  }

  public params<P>(key: keyof P | string, value: unknown): this;
  public params(params: MetalRequestParams, merge?: boolean): this;
  /**
   * Apply single request params, or replace the current request params.
   * @param keyParams - String param name, or object params. Current params will be replaced if the argument is an object.
   * @param value - Param value, required if the first param is a string.
   */
  public params(keyParams: string | MetalRequestParams, value?: any): this {
    if (typeof keyParams === 'string') {
      _.set(this._options, `params.${keyParams}`, value);
    } else {
      if (value) {
        if (!this._options.params) {
          this._options.params = {};
        }

        _.merge(this._options.params, keyParams);
      } else {
        this._options.params = keyParams as any;
      }
    }

    return this;
  }

  public select(fields: Fields<T>): this;
  public select(fields: Fields<T>, fetch?: boolean): Promise<this>;
  /**
   * Select the fields to be stored in the data.
   * @param fields - Field names.
   * @param fetch - Immediately fetch the data.
   */
  public select(fields: Fields<T>, fetch?: boolean): this | Promise<this> {
    this._options.fields = fields;

    if (fetch) {
      return this.fetch();
    }

    return this;
  }

  public exclude(fields: Fields<T>): this;
  public exclude(fields: Fields<T>, fetch?: boolean): Promise<this>;
  /**
   * Select the fields to be removed from the data.
   * @param fields - Field names.
   * @param fetch - Immediately fetch the data.
   */
  public exclude(fields: Fields<T>, fetch?: boolean): this | Promise<this> {
    this._options.excludeFields = fields;

    if (fetch) {
      return this.fetch();
    }

    return this;
  }

  /**
   * Save the local changes to the server by performing a PATCH request.
   * If the record doesn't have an ID, it'll perform a POST request.
   * @param options - Optional request options.
   * @param sync - Mark the record as sync state.
   */
  public async save(options: MetalRequestOptions = {}, sync?: boolean): Promise<this> {
    if (sync) {
      this._sync();
    }

    try {
      if (!this.hasChanges) {
        if (sync) {
          this._ready();
        }

        return this;
      }

      if (this.id) {
        this.stash();

        await this.collection.update(this.id, this.changes, options);

        this.mirror = JSON.parse(JSON.stringify(this.data));
        this._writeCache();
      } else {
        this.status = 'post';
        this.statusChange.emit(this.status);

        try {
          const data = await this.collection.create(this.data, options);
          this.id = data.id;
          this.assign(data);

          if (this.fref) {
            this.collection.removeForm(this.fref);
          }
        } catch (error) {
          throw error;
        }

        this.status = 'ready';
        this.statusChange.emit(this.status);
      }

      if (sync) {
        this._ready();
      }
    } catch (error) {
      if (sync) {
        this._throw(error);
      } else {
        throw error;
      }
    }

    return this;
  }

  /**
   * Assign a new data to the existing data and perform a PATCH request.
   * @param payload - Data to be applied.
   * @param options - Optional request options.
   * @param sync - Mark the record as sync state.
   */
  public async update(payload: MetalPartialData<T>, options: MetalRequestOptions = {}, sync?: boolean): Promise<this> {
    try {
      this.set(payload);
      await this.save(options, sync);
    } catch (error) {
      this.reset();

      if (sync) {
        this._throw(error);
      } else {
        throw error;
      }
    }

    return this;
  }

  /**
   * Delete the record on the server by performing a DELETE request.
   * @param options - Optional request options.
   * @param sync - Mark the record as sync state.
   */
  public async delete(options: MetalRequestOptions = {}, sync?: boolean): Promise<this> {
    if (sync) {
      this._sync();
    }

    try {
      await this.collection.delete(this.id, options);
      this.deleted = true;

      if (sync) {
        this._ready();
      }
    } catch (error) {
      if (sync) {
        this._throw(error);
      } else {
        throw error;
      }
    }

    return this;
  }

  /**
   * Fetch the remote data by performing a GET request. After the request done,
   * the local data will be replaced and marked as fresh, and the local changes will be discarded.
   * @param options - Optional request options.
   */
  public async fetch(options: MetalFindOptions<T> = {}): Promise<this> {
    this.status = this.status === 'ready' ? 'sync' : 'init';
    this.statusChange.emit(this.status);

    if (options && options.delay) {
      await sleep(options.delay);
    }

    try {
      const data = await this.collection.findOne(this.id, {
        ...this._options,
        ...options,
        referrer: {
          record: this,
          query: this.query,
        }
      });

      this.assign(data);
      this.initialized = true;
      this._ready();
    } catch (error) {
      this._throw(error);
    }

    return this;
  }

  /**
   * Subscribe for changes to this record. If there is PUT or PATCH request to this record endpoint,
   * then the websocket will trigger an event.
   */
  public async subscribe(): Promise<this> {
    this.subscription = await this.collection.subscribe(this.id, async (event) => {
      if (event.type === 'delete') {
        this.deleted = true;
        this.statusChange.emit(this.status);
      } else {
        await this.fetch();
      }
    });

    return this;
  }

  /**
   * Unsubscribe for changes to this record.
   */
  public async unsubscribe(): Promise<this> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }

    return this;
  }

  public json(stringify: true): string;
  public json(stringify: false): T;
  public json(stringify?: boolean): string | T {
    const jsonString = JSON.stringify(this.data);

    if (stringify) {
      return jsonString;
    } else {
      return JSON.parse(jsonString);
    }
  }
}

/**
 * An extended Array with a sets of helper methods and only accepts Record as item.
 */
export class MetalRecordList<T> extends Array<MetalRecord<T>> {
  /**
   * Returns an array of the selected records.
   */
  public get selectedRecords(): MetalRecordList<T> {
    return this.filter(rec => rec.selected) as MetalRecordList<T>;
  }

  /**
   * Check does all records are selected.
   */
  public get allRecordsSelected(): boolean {
    return this.selectedRecords.length === this.length;
  }

  /**
   * Check does a few records are selected.
   */
  public get fewRecordsSelected(): boolean {
    return (this.selectedRecords.length >= 1 && this.selectedRecords.length < this.length);
  }

  /**
   * Get the plain data list instead of a record list.
   */
  public get data(): T[] {
    return [...this].map(record => record.data);
  }

  /**
   * Construction method, only accepts Record class.
   * @param items
   */
  constructor(...items: Array<MetalRecord<T>>) {
    super(...items);

    Object.setPrototypeOf(this, MetalRecordList.prototype);
  }

  /**
   * Mark all records as selected.
   */
  public selectAll(): void {
    this.forEach(rec => {
      (rec as any)._selected = true;
      rec.selectionChange.emit(true);
    });

    if (this[0].query) {
      this[0].query.selectionChange.emit(this);
    }
  }

  /**
   * Mark all recods as unselected.
   */
  public deselectAll(): void {
    this.forEach(rec => {
      (rec as any)._selected = false;
      rec.selectionChange.emit(false);
    });

    if (this[0].query) {
      this[0].query.selectionChange.emit(this);
    }
  }

  public json(stringify: true): string;
  public json(stringify: false): T[];
  public json(stringify?: boolean): string | T[] {
    const jsonString = JSON.stringify(this.map(rec => rec.data));

    if (stringify) {
      return jsonString;
    } else {
      return JSON.parse(jsonString);
    }
  }

  /**
   * Bulk update all records.
   * @param payload - Data to be applied to all records.
   * @param options - Optional request options.
   */
  public async update(payload: MetalPartialData<T>, options?: MetalRequestOptions) {
    try {
      return await Promise.all(this.map(item => item.update(payload, options)));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Bulk delete all records.
   * @param options - Optional request options.
   */
  public async delete(options?: MetalRequestOptions) {
    try {
      return await Promise.all(this.map(item => item.delete(options)));
    } catch (error) {
      throw error;
    }
  }
}

/**
 * An extended array contains MetalData and its parent collection.
 */
export class MetalDataList<T> extends Array<T> {
  constructor(...items: T[]) {
    super(...items);

    Object.setPrototypeOf(this, MetalDataList.prototype);
  }
}
