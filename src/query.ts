import * as _ from 'lodash';
import { Subscription } from 'metal-event-client';
import { MetalCollection } from './collection';
import { EventEmitter, EventHandler, Unsubscribe } from './event';
import {
  Fields,
  MetalData,
  MetalDataMeta,
  MetalFindOptions,
  MetalPartialData,
  MetalQueryFilterRefs,
  MetalQueryFilters,
  MetalQueryLocalCaches,
  MetalQueryOptions,
  MetalQueryPersistentCache,
  MetalQueryQueue,
  MetalQueryQueueMeta,
  MetalQueryStatus,
  MetalRequestOptions,
  MetalRequestParams,
  MetalSyncMethod,
  OrderBy,
  RealtimeEvent,
  WhereFilter
} from './interface';
import { MetalDataList, MetalRecord, MetalRecordList } from './record';
import { MetalTransactionError } from './request';
import { MetalState, StateStore } from './state';
import { diff } from './utils/diff';
import { inherit } from './utils/object';
import { sleep } from './utils/sleep';
import uuid from './uuid';

/**
 * A Query object with a sets of helper methods to manage the filters and the cached data.
 */
export class MetalQuery<T extends MetalData> {
  public href: string;
  public status: MetalQueryStatus = 'init';
  public statusChange: EventEmitter<this> = new EventEmitter<this>();

  public syncMethod: MetalSyncMethod;
  public initialized: boolean;

  public records: MetalRecordList<T> = new MetalRecordList<T>();
  public recordChange: EventEmitter<MetalRecordList<T>> = new EventEmitter<MetalRecordList<T>>();
  public selectionChange: EventEmitter<MetalRecord<T> | MetalRecordList<T> | MetalRecord<T>[]> = new EventEmitter();
  public meta: MetalDataMeta;
  public metaChange: EventEmitter<MetalDataMeta> = new EventEmitter<MetalDataMeta>();

  public error: MetalTransactionError<T>;

  private _caches: MetalQueryLocalCaches<T> = {};
  private _timeout: any;
  private _finalizerID: string;
  private _subscription: Subscription<T>;
  private _subscribers: EventHandler<RealtimeEvent<T>>[] = [];
  private _previousFilters: MetalQueryFilters<T> = {};

  public get hasFilterChanges(): boolean {
    return Object.keys(this.filterChanges).length > 0;
  }

  public get filterChanges(): any {
    return diff(this.filters, this._previousFilters);
  }

  constructor(public name: string,
              public collection: MetalCollection<T>,
              public filters: MetalQueryFilters<T> = {},
              public options: MetalQueryOptions = {}) {
    inherit('persistentCache', collection.configs, options);
    inherit('memoryCache', collection.configs, options);
    inherit('syncDelay', collection.configs, options);

    this.href = `${collection.href}.${name}.query`;
    this._init()._loadCaches();
  }

  private _init(): this {
    if (!this.filters.limit) {
      this.filters.limit = this.collection.configs.defaultLimit || this.collection.origin.configs.defaultLimit || 10;
    }

    if (!this.filters.page) {
      this.filters.page = 1;
    }

    if (this.collection.configs.filterRefs) {
      this.filters.filterRefs = this.collection.configs.filterRefs;
    }

    return this;
  }

  private _loadCaches() {
    const { persistentCache, memoryCache } = this.options;

    if (persistentCache) {
      this._applyCaches(StateStore.store(this.href));
    }

    if (memoryCache) {
      this._applyCaches(StateStore.get(this.href));
    }
  }

  private _applyCaches(fromState: MetalState<MetalQueryPersistentCache<T>>) {
    if (!this.initialized) {
      if (fromState.data.meta) {
        this.meta = { ...this.meta || {}, ...fromState.data.meta };
      }

      if (fromState.data.filters) {
        const { params, where, search, page, limit, orderBy } = fromState.data.filters;
        Object.assign(this.filters, {
          params, where, search, page, limit, orderBy
        });
      }

      if (Array.isArray(fromState.data.data)) {
        this.records = new MetalRecordList<T>(...fromState.data.data.map(data => this.collection.createRecord(data.id, data)));
        this.recordChange.emit(this.records);
        this.syncMethod = 'init';
        this._ready();
      }
    }
  }

  private _writeCaches() {
    const { persistentCache, memoryCache } = this.options;
    const { params, where, search, page, limit, orderBy } = this.filters;

    if (persistentCache) {
      StateStore.store<MetalQueryPersistentCache<T>>(this.href).set({
        data: this.records.map(record => record.data),
        meta: this.meta,
        filters: { params, where, search, page, limit, orderBy }
      });
    }

    if (memoryCache) {
      StateStore.get<MetalQueryPersistentCache<T>>(this.href).set({
        data: this.records.map(record => record.data),
        meta: this.meta,
        filters: { params, where, search, page, limit, orderBy }
      });
    }
  }

  private _ready() {
    this._previousFilters = JSON.parse(JSON.stringify(this.filters)) as MetalQueryFilters<T>;

    this.error = null;
    this.status = 'ready';
    this.initialized = true;

    this.statusChange.emit(this);
  }

  private _throw(error: MetalTransactionError<T>) {
    this.error = error;
    this.status = 'ready';

    this.statusChange.emit(this);
  }

  /**
   * Clear the cache and filters.
   */
  public clear(): this {
    this._caches = {};
    this.records = new MetalRecordList<T>();
    this.recordChange.emit(this.records);
    this.filters = {};

    this._init();
    this.statusChange.emit(this);
    return this;
  }

  /**
   * Replace the existing filters with new filters.
   * @param filters - Filter object to replace the existing filters.
   */
  public assign(filters: MetalQueryFilters<T>): this {
    this.filters = filters;
    this.statusChange.emit(this);
    return this;
  }

  /**
   * Schedule a background sync to update the local data with the remote data.
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
   * Method to stop the background sync scheduler.
   */
  public stopSchedule(): void {
    clearTimeout(this._timeout);
  }

  public filterRef(refs: MetalQueryFilterRefs<T>): this;
  public filterRef(refs: MetalQueryFilterRefs<T>, fetch?: boolean): Promise<MetalRecordList<T>>;
  /**
   * Add filter reference requests.
   * @param refs - Filter reference schema.
   * @param fetch - Immediately fetch the data.
   */
  public filterRef(refs: MetalQueryFilterRefs<T>, fetch?: boolean): this | Promise<MetalRecordList<T>> {
    this.filters.filterRefs = refs;
    if (fetch) {
      return this.fetch();
    } else {
      this.statusChange.emit(this);
    }

    return this;
  }

  public search(query: string): this;
  public search(query: string, fetch?: boolean): Promise<MetalRecordList<T>>;
  /**
   * Add search query to the filters.
   * @param query - Text to search.
   * @param fetch - Immediately fetch the data.
   */
  public search(query: string, fetch?: boolean): this | Promise<MetalRecordList<T>> {
    this.filters.search = query;

    if (fetch) {
      return this.fetch();
    } else {
      this.statusChange.emit(this);
    }

    return this;
  }

  public where(filters: WhereFilter<T>): this;
  public where(filters: WhereFilter<T>, fetch?: boolean): Promise<MetalRecordList<T>>;
  /**
   * Apply a new Where filter.
   * @param filters
   * @param fetch
   */
  public where(filters: WhereFilter<T>, fetch?: boolean): this | Promise<MetalRecordList<T>> {
    this.filters.where = filters;
    if (fetch) {
      return this.fetch();
    } else {
      this.statusChange.emit(this);
    }

    return this;
  }

  public orderBy(orderBy: OrderBy<T>): this;
  public orderBy(orderBy: OrderBy<T>, fetch?: boolean): Promise<MetalRecordList<T>>;
  /**
   * Apply a new OrderBy filters.
   * @param orderBY
   * @param fetch
   */
  public orderBy(orderBY: OrderBy<T>, fetch?: boolean): this | Promise<MetalRecordList<T>> {
    this.filters.orderBy = orderBY;
    if (fetch) {
      return this.fetch();
    } else {
      this.statusChange.emit(this);
    }

    return this;
  }

  public goto(page: number): this;
  public goto(page: number, fetch?: boolean): Promise<MetalRecordList<T>>;
  /**
   * Go to a specific page.
   * @param page
   * @param fetch
   */
  public goto(page: number, fetch?: boolean): this | Promise<MetalRecordList<T>> {
    this.filters.page = page;
    if (fetch) {
      return this.fetch();
    } else {
      this.statusChange.emit(this);
    }

    return this;
  }

  public limit(max: number): this;
  public limit(max: number, fetch?: boolean): Promise<MetalRecordList<T>>;
  /**
   * Set the number of the returned records per request.
   * @param max
   * @param fetch
   */
  public limit(max: number, fetch?: boolean): this | Promise<MetalRecordList<T>> {
    this.filters.limit = max;
    if (fetch) {
      return this.fetch();
    } else {
      this.statusChange.emit(this);
    }

    return this;
  }

  public select(fields: Fields<T>): this;
  public select(fields: Fields<T>, fetch?: boolean): Promise<MetalRecordList<T>>;
  /**
   * Select the fields to be returned on the records.
   * @param fields - Array field names.
   * @param fetch - Fetch the data.
   */
  public select(fields: Fields<T>, fetch?: boolean): this | Promise<MetalRecordList<T>> {
    this.filters.fields = fields;

    if (fetch) {
      return this.fetch();
    } else {
      this.statusChange.emit(this);
    }

    return this;
  }

  public params(params: MetalRequestParams): this;
  public params(params: MetalRequestParams, fetch?: boolean): Promise<MetalRecordList<T>>;
  /**
   * Apply a new Request Params.
   * @param params
   * @param fetch
   */
  public params(params: MetalRequestParams, fetch?: boolean): this | Promise<MetalRecordList<T>> {
    this.filters.params = params;

    if (fetch) {
      return this.fetch();
    } else {
      this.statusChange.emit(this);
    }

    return this;
  }

  public set(key: string, value: any): this;
  public set(options: MetalRequestOptions): this;
  /**
   * Set the query options to be used when fetching the data.
   * @param keyOptions - Property name, or an options object.
   * @param value - Property value, required if the first argument is string.
   */
  public set(keyOptions: string | MetalRequestOptions, value?: any): this {
    if (typeof keyOptions === 'string') {
      _.set(this.options, keyOptions, value);
    } else {
      this.options = keyOptions;
    }

    this.statusChange.emit(this);
    return this;
  }

  public async head(override?: boolean): Promise<MetalDataMeta>;
  public async head(options?: MetalFindOptions<T>, override?: boolean): Promise<MetalDataMeta>;
  /**
   * Fetch the remote meta data.
   * @param options - Optional request options.
   * @param override - Override the local meta data.
   */
  public async head(options?: MetalFindOptions<T> | boolean, override?: boolean): Promise<MetalDataMeta> {
    try {
      const meta = await this.collection.head(this.filters, {
        ...this.options,
        ...(typeof options === 'object' ? options : {}),
        referrer: {
          query: this
        }
      });

      if ((typeof options === 'boolean' && options) || override) {
        this.meta = meta;
        this.metaChange.emit(this.meta);
        this._writeCaches();
      }

      return meta;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetch the remote data and replace the local data.
   * @param options - Optional request options.
   */
  public async fetch(options: MetalFindOptions<T> = {}): Promise<MetalRecordList<T>> {
    const trxID = uuid();

    this._finalizerID = trxID;
    this.error = null;
    this.status = this.initialized ? 'sync' : 'init';

    try {
      const filterString = JSON.stringify(this.filters);
      const cached = this._caches[filterString];

      this.syncMethod = this.hasFilterChanges && !cached ? 'init' : 'update';

      if (cached && cached.records !== this.records) {
        this.records = cached.records;
        this.recordChange.emit(this.records);
        this.selectionChange.emit(this.records);
      }

      this.statusChange.emit(this);

      if (options && options.delay) {
        await sleep(options.delay);
      }

      const trx = await this.collection.find(this.filters, {
        ...this.options,
        ...options,
        referrer: {
          query: this,
        }
      }, true);

      if (cached) {
        const cachedData = JSON.stringify(cached.transaction.response.data.data);
        const futureData = JSON.stringify(trx.response.data.data);

        if (cachedData === futureData) {
          if (this._finalizerID === trxID) {
            this.meta = trx.response.data.meta;
            this.metaChange.emit(this.meta);

            this._ready();
          }

          return this.records;
        }
      }

      const records = trx.response.data.data.map(rec => this.collection.createRecord(rec.id, rec));
      const recordList = new MetalRecordList(...records);

      recordList.forEach(record => {
        record.query = this;

        if (this.filters.fields) {
          record.select(this.filters.fields);
        }

        if (this.filters.params) {
          record.params(this.filters.params);
        }
      });

      if (this.options.memoryCache) {
        this._caches[filterString] = {
          transaction: trx,
          records: recordList,
        };
      }

      if (this._finalizerID === trxID) {
        this.meta = trx.response.data.meta;
        this.metaChange.emit(this.meta);
        this.records = recordList;
        this.recordChange.emit(this.records);
        this.selectionChange.emit(this.records.selectedRecords);

        this._writeCaches();
        this._ready();
      }

      return recordList;
    } catch (error) {
      if (this._finalizerID === trxID) {
        this._throw(error);
      }

      throw error;
    }
  }

  /**
   * Fetch all the remote data and return the queue.
   * @param chunkSize - Split the request by number of records per request.
   * @param options - Optional request options.
   */
  public async browse(chunkSize = 1000, options: MetalFindOptions<T> = {}): Promise<MetalQueryQueue<T>> {
    try {
      const meta = await this.head(options);
      const data: MetalQueryQueueMeta<T> = {
        ...meta,
        records: new MetalDataList<T>(),
      };

      return this.collection.origin.driver.queue.start(data, async (q: MetalQueryQueue<T>) => {
        const trx = await this.collection.find(
          {
            ...this.filters,
            limit: chunkSize,
            page: 1,
          },
          {
            ...this.options,
            ...options,
            referrer: {
              query: this
            },
            browse: true,
            meta
          },
          true
        );

        const { data: records, meta: metaData } = trx.response.data;

        if (Array.isArray(records)) {
          data.records.push(...records);
        }

        if (metaData && metaData.nextPage) {
          meta.nextPage = metaData.nextPage;
        }

        if (data.records.length < data.totalRecords && meta.nextPage) {
          q.handler(q);
        } else {
          q.finish();
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update a single record by performing a PATCH request.
   * @param id - Record ID.
   * @param payload - Data to be applied.
   * @param options - Optional request options.
   */
  public async update(id: string, payload: MetalPartialData<T>, options?: MetalRequestOptions): Promise<void> {
    try {
      const record = this.records.filter(rec => rec.id === id)[0];
      if (record) {
        await record.update(payload, options);
      }
      this.statusChange.emit(this);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Bulk update all records by performing a PATCH request.
   * @param payload - Data to be applied.
   * @param options - Optional request options.
   */
  public async updateAll(payload: MetalPartialData<T>, options?: MetalRequestOptions): Promise<void> {
    try {
      await Promise.all(this.records.map(record => {
        return record.update(payload, options);
      }));
      this.statusChange.emit(this);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a single record by peforming a DELETE request.
   * @param id - Record ID.
   * @param options - Optional request options.
   */
  public async delete(id: string, options?: MetalRequestOptions): Promise<void> {
    try {
      const record = this.records.filter(rec => rec.id === id)[0];
      if (record) {
        await record.delete(options);
      }
      this.statusChange.emit(this);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Bulk delete all records by performing a DELETE requests.
   * @param options - Optional request options.
   */
  public async deleteAll(options?: MetalRequestOptions): Promise<void> {
    try {
      await Promise.all(this.records.map(record => {
        return record.delete(options);
      }));
      this.statusChange.emit(this);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Subscribe for the endpoint changes. If there is POST, PUT, or PATCH request happened to the endpoint,
   * then websocket will trigger an event.
   */
  public subscribe(handler?: EventHandler<RealtimeEvent<T>>): Unsubscribe {
    if (typeof handler === 'function') {
      this._subscribers.push(handler);
    }

    const unsubscribe = () => {
      if (typeof handler === 'function') {
        this._subscribers.splice(this._subscribers.indexOf(handler), 1);
      }

      if (!this._subscribers.length) {
        this.unsubscribe().catch(console.error);
      }
    };

    if (this._subscription || !this.collection.origin.socketConnected) {
      return unsubscribe;
    }

    this.collection
      .subscribe(async (event) => {
        const { type, data } = event;

        if (type === 'post') {
          await this.fetch({ delay: this.options.syncDelay });
        } else {
          if (data && data.id) {
            for (const record of this.records) {
              if (record.id === data.id) {
                if (event.type === 'delete') {
                  record.deleted = true;
                  record.statusChange.emit(record.status);
                } else if (event.type === 'put' || event.type === 'patch') {
                  delete data.id;
                  record.set(data);
                }
              }
            }
          }
        }

        this._subscribers.forEach(emit => {
          emit(event as RealtimeEvent<T>);
        });
      })
      .then(sub => this._subscription = sub)
      .catch(console.error);

    return unsubscribe;
  }

  /**
   * Unsubscribe for the endpoint changes.
   */
  public async unsubscribe(): Promise<void> {
    if (this._subscription) {
      await this._subscription.unsubscribe();
      this._subscription = null;
    }
  }
}

export function filterToQueryParams<T>(filters: MetalQueryFilters<T> = {}): MetalRequestParams {
  const { params, where, orderBy, fields, excludeFields, filterRefs, limit, page, search } = filters;
  return { where, orderBy, fields, excludeFields, filterRefs, limit, page, search, ...params };
}
