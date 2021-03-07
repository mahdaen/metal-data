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
import { Subscription } from 'metal-event-client';
import * as _ from 'lodash';
import { MetalCollection } from './collection';
import { EventEmitter } from './event';
import { MetalQuery } from './query';
import { diff } from './utils/diff';
import { sleep } from './utils/sleep';

/**
 * A special class with a sets of helper methods to manage a single record.
 */
export class MetalRecord<T extends MetalData> {
  public href: string;
  /** JSON encoded data as the raw data to check the changes **/
  public encoded: string;
  /** Property to mark the record as deleted **/
  public deleted: boolean;

  public query?: MetalQuery<T>;

  /** Property to mark the record status **/
  public status: MetalRecordState = 'init';
  /**
   * An Event Emitter instance to subscribe when the record state changed.
   */
  public statusChange: EventEmitter<MetalRecordState> = new EventEmitter<MetalRecordState>();
  public dataChange: EventEmitter<T> = new EventEmitter<T>();

  /** Property to store the errors **/
  public error: Error;
  /**
   * An Event Emitter instance to subscribe when an error happened.
   */
  public errorChange: EventEmitter<Error> = new EventEmitter<Error>();
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
  private _timeout: any;

  /**
   * Get the changed properties.
   */
  public get changes(): MetalPartialData<T> {
    return diff(JSON.parse(this.encoded || '{}'), this.data);
  }

  /**
   * Check does the record has any changes.
   */
  public get hasChanges(): boolean {
    return Object.keys(this.changes || {}).length > 0;
  }

  private _options: MetalFindOptions<T> = {};

  /**
   * A record construction.
   * @param collection - The parent collection to manage the record.
   * @param id - Record ID.
   * @param data - The record data.
   */
  constructor(public collection: MetalCollection<T>,
              public id: string,
              public data: T = {} as T) {
    this.href = `${collection.href}/${id}`;

    if (data.id) {
      this.status = 'ready';
    }

    this.encoded = JSON.stringify(data);
  }

  /**
   * Schedule background sync.
   * @param timeout - The timeout duration.
   * @param repeat - Number of how many the background sync should repeats. Use Infinity to keep the background sync.
   * @param options - Optional request options.
   */
  public schedule(timeout: number, repeat?: number, options?: MetalRequestOptions): this {
    clearTimeout(this._timeout);

    const reschedule = () => {
      if (repeat) {
        if (repeat === Infinity) {
          this.schedule(timeout, repeat, options);
        } else {
          this.schedule(timeout, repeat - 1, options);
        }
      }
    };

    this._timeout = setTimeout(() => {
      this
        .fetch(options)
        .then(reschedule)
        .catch(reschedule);
    }, timeout);

    return this;
  }

  /**
   * Stop the background sync scheduler.
   */
  public stopSchedule(): void {
    clearTimeout(this._timeout);
  }

  /**
   * Assign a new data to the existing data. All changes will be reset.
   * @param data - Data to be applied.
   */
  public assign(data: T): this {
    this.encoded = JSON.stringify(data);
    Object.assign(this.data, data);
    this.dataChange.emit(this.data);

    return this;
  }

  /**
   * Reset the data to the initial state.
   */
  public reset(): this {
    this.data = JSON.parse(this.encoded);
    this.dataChange.emit(this.data);
    return this;
  }

  public set(key: string, value: any): this;
  public set(data: MetalPartialData<T>): this;
  /**
   * Apply new changes to the data.
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

  public params(key: string, value: any): this;
  public params(params: MetalRequestParams): this;
  /**
   * Apply single request params, or replace the current request params.
   * @param keyParams - String param name, or object params. Current params will be replaced if the argument is an object.
   * @param value - Param value, required if the first param is a string.
   */
  public params(keyParams: string | MetalRequestParams, value?: any): this {
    if (typeof keyParams === 'string') {
      _.set(this._options, `params.${keyParams}`, value);
    } else {
      this._options.params = keyParams;
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
   */
  public async save(options?: MetalRequestOptions): Promise<this> {
    try {
      if (this.id) {
        this.status = 'sync';

        const encoded = JSON.stringify(this.data);
        await this.collection.update(this.id, this.changes, options);
        this.encoded = encoded;
      } else {
        const data = await this.collection.create(this.data, options);
        this.assign(data);
      }

      this.status = 'ready';
      this.statusChange.emit(this.status);
    } catch (error) {
      this.error = error;
      this.errorChange.emit(error);
      this.statusChange.emit(this.status);
      throw error;
    }

    return this;
  }

  /**
   * Assign a new data to the existing data and perform a PATCH request.
   * @param payload - Data to be applied.
   * @param options - Optional request options.
   */
  public async update(payload: MetalPartialData<T>, options?: MetalRequestOptions): Promise<this> {
    try {
      Object.assign(this.data, payload);
      await this.save(options);
    } catch (error) {
      throw error;
    }

    return this;
  }

  /**
   * Delete the record on the server by performing a DELETE request.
   * @param options - Optional request options.
   */
  public async delete(options?: MetalRequestOptions): Promise<this> {
    this.status = 'sync';

    try {
      await this.collection.delete(this.id, options);
      this.status = 'ready';
      this.deleted = true;
      this.statusChange.emit(this.status);
    } catch (error) {
      throw error;
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
      this.status = 'ready';
      this.statusChange.emit(this.status);
    } catch (error) {
      this.error = error;
      this.errorChange.emit(error);
      this.statusChange.emit(this.status);
      throw error;
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
  public get selectedRecords(): MetalRecord<T>[] {
    return this.filter(rec => rec.selected);
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
