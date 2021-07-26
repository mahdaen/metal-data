import * as _ from 'lodash';
import { Subscription, SubscriptionHandler } from 'metal-event-client';
import {
  MetalCollectionConfig,
  MetalData,
  MetalDataListing,
  MetalDataMeta,
  MetalFindOptions,
  MetalPartialData,
  MetalQueriesState,
  MetalQueryFilters,
  MetalQueryOptions,
  MetalRecordsState,
  MetalRequestMethod,
  MetalRequestOptions,
  MetalRequestParams
} from './interface';
import { MetalOrigin } from './origin';
import { MetalPath } from './path';
import { filterToQueryParams, MetalQuery } from './query';
import { MetalDataList, MetalRecord, MetalRecordList } from './record';
import { MetalRequest, MetalTransaction, MetalTransactionError } from './request';
import { SchemaError, validateSchemas } from './schema';
import { StateStore } from './state';
import { inherit } from './utils/object';
import { typeOf } from './utils/typeof';

interface MetalCollectionRequestConfig<T> {
  id?: string;
  filters?: MetalQueryFilters<T>;
  payload?: MetalPartialData<T>;
  options?: MetalRequestOptions;
  returnTransaction?: boolean;
}

export class MetalCollection<T extends MetalData,
  O extends MetalOrigin = MetalOrigin,
  C extends MetalCollectionConfig<T> = MetalCollectionConfig<T>> {
  public name: string;
  public href: string;
  public path: MetalPath;
  public queries: MetalQueriesState<T, this> = {};
  public records: MetalRecordsState<T, this> = {};
  public forms: MetalRecordsState<T, this>;

  constructor(public origin: O,
              public configs: C) {
    inherit('persistentCache', origin.configs, configs);
    inherit('memoryCache', origin.configs, configs);
    inherit('syncDelay', origin.configs, configs);

    this.name = configs.name;
    this.href = `${this.origin.href}${configs.name}`;
    this.path = new MetalPath(this);
    this.origin.collection(this);
    this.forms = StateStore.get<MetalRecordsState<T, this>>(`${this.href}.forms`).data;
  }

  /**
   * Get a single record from the collection. If no cached record for the specific ID,
   * it'll init a new record.
   * @param id - Record ID.
   */
  public get(id: string): MetalRecord<T, this> {
    if (this.configs.memoryCache) {
      if (!this.records[id]) {
        this.records[id] = this.createRecord(id);
      }

      return this.records[id].init();
    }

    return this.createRecord(id).init();
  }

  public query(filters?: MetalQueryFilters<T>, options?: MetalQueryOptions): MetalQuery<T, this>;
  public query(name: string, filters?: MetalQueryFilters<T>, options?: MetalQueryOptions): MetalQuery<T, this>;
  /**
   * Get a query from the collection. If no cached query for the specific name, it'll init a new Query.
   * @param name - Query name for a named query, or query filters to get a general query.
   * @param filters - Optional query filters, only used once and will not overwrite the existing Query.
   * @param options - Request options, used when fetching the data.
   */
  public query(name?: string | MetalQueryFilters<T>,
               filters?: MetalQueryFilters<T> | MetalQueryOptions,
               options?: MetalQueryOptions): MetalQuery<T, this> {
    if (typeof name === 'string') {
      if (this.configs.memoryCache) {
        if (!this.queries[name]) {
          this.queries[name] = new MetalQuery(name, this, filters, options);
        }

        return this.queries[name];
      } else {
        return new MetalQuery(name, this, filters, options);
      }
    } else {
      return this.query('general', name, filters);
    }
  }

  /**
   * Create a Record instance from a plain data.
   * @param data - Data to be converted to a Record instance.
   */
  public createRecord(data?: T): MetalRecord<T, this>;
  /**
   * Create a Record instance from a plain data.
   * @param id - Record ID.
   * @param data - Data to be converted to a Record instance.
   */
  public createRecord(id?: string, data?: T): MetalRecord<T, this>;
  public createRecord(idData?: string | T, data?: T): MetalRecord<T, this> {
    let record;

    if (typeof idData === 'string') {
      record = new MetalRecord(this, idData, data);
    } else {
      record = new MetalRecord(this, null, idData);
    }

    this.transformRelation(record);
    return record;
  }

  /**
   * Create an empty record as a form data.
   * @param name - Name to identify the cache data.
   * @param data - Initial data to assign.
   */
  public createForm(name = 'global', data?: T): MetalRecord<T, this> {
    if (!this.forms[name]) {
      this.forms[name] = new MetalRecord(this, null, data);
    }

    return this.forms[name];
  }

  public async head(filters?: MetalQueryFilters<T>,
                    options?: MetalFindOptions<T>): Promise<MetalDataMeta>;
  public async head(filters?: MetalQueryFilters<T>,
                    options?: MetalFindOptions<T>,
                    returnTransaction?: boolean): Promise<MetalTransaction<MetalDataMeta>>;
  /**
   * Get a listing meta data by doing a HEAD request.
   * @param filters - Optional query filters to be applied to the request.
   * @param options - Optional request options.
   * @param returnTransaction - Return the transaction itself instead the meta data.
   */
  public async head(filters?: MetalQueryFilters<T>,
                    options?: MetalFindOptions<T>,
                    returnTransaction?: boolean): Promise<MetalDataMeta | MetalTransaction<MetalDataMeta>> {
    try {
      const req = this.createRequest('head', filterToQueryParams(filters), options);
      req.listing = true;

      if (typeof this.beforeHead === 'function') {
        await this.beforeHead(req);
      }

      const trx = await this.origin.head<MetalDataMeta>(req);

      if (typeof this.afterHead === 'function') {
        await this.afterHead(trx.response.data, trx);
      }

      if (returnTransaction) {
        return trx;
      }

      return trx.response.data;
    } catch (error) {
      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }
      throw error;
    }
  }

  public async find(filters?: MetalQueryFilters<T>,
                    options?: MetalFindOptions<T>): Promise<MetalDataList<T>>;
  public async find(filters?: MetalQueryFilters<T>,
                    options?: MetalFindOptions<T>,
                    returnTransaction?: boolean): Promise<MetalTransaction<MetalDataListing<T>>>;
  /**
   * Get a list of an items by performing a GET request. Once the request complete, it'll returns an
   * array of plain objects.
   * @param filters - Optional query filters to be applied to the request.
   * @param options - Optional request options.
   * @param returnTransaction - Use true to return the transaction object instead of an array.
   */
  public async find(filters?: MetalQueryFilters<T>,
                    options?: MetalFindOptions<T>,
                    returnTransaction?: boolean): Promise<MetalDataList<T> | MetalTransaction<MetalDataListing<T>>> {
    try {
      const req = this.createRequest('get', filterToQueryParams(filters), options);
      req.listing = true;

      if (typeof this.transformRequest === 'function') {
        this.transformRequest(req);
      }

      if (typeof this.beforeFind === 'function') {
        await this.beforeFind(req);
      }

      const trx = await this.origin.get<MetalDataListing<T>>(req);

      if (typeof this.transformResponse === 'function') {
        await this.transformResponse(trx);
      }

      if (typeof this.afterFind === 'function') {
        await this.afterFind(trx.response.data.data, trx);
      }

      if (filters && (filters.fields || filters.excludeFields)) {
        this.selectFields(trx.response.data.data, filters);
      }
      if (options && (options.fields || options.excludeFields)) {
        this.selectFields(trx.response.data.data, {
          fields: options.fields,
          excludeFields: options.excludeFields
        });
      }

      if (returnTransaction) {
        return trx;
      }

      return new MetalDataList(...trx.response.data.data);
    } catch (error) {
      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }
      throw error;
    }
  }

  public async findOne(id: string,
                       options?: MetalFindOptions<T>): Promise<T>;
  public async findOne(id: string,
                       options?: MetalFindOptions<T>,
                       returnTransaction?: boolean): Promise<MetalTransaction<T>>;
  /**
   * Get a single item by performing a GET request. Once the request complete, it'll returns a plain object.
   * @param id - Item ID.
   * @param options - Optional request object.
   * @param returnTransaction - Use true to return the transaction object instead of a plain object.
   */
  public async findOne(id: string,
                       options?: MetalFindOptions<T>,
                       returnTransaction?: boolean): Promise<T | MetalTransaction<T>> {
    try {
      const req = this.createRecordRequest(id, 'get', options);

      if (typeof this.beforeFindOne === 'function') {
        await this.beforeFindOne(id, req);
      }

      const trx = await this.origin.get<T>(req);

      if (typeof this.transformResponse === 'function') {
        await this.transformResponse(trx);
      }

      if (typeof this.afterFindOne === 'function') {
        await this.afterFindOne(trx.response.data, trx);
      }

      if (options && (options.excludeFields || options.fields)) {
        this.selectFields(trx.response.data, {
          fields: options.fields,
          excludeFields: options.excludeFields
        });
      }

      if (returnTransaction) {
        return trx;
      }

      return trx.response.data;
    } catch (error) {
      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }
      throw error;
    }
  }

  /**
   * Create an item by performing a POST request.
   * @param payload - Item data to be created.
   * @param options - Optional request options.
   */
  public async create(payload?: T, options?: MetalRequestOptions): Promise<T> {
    try {
      this.ensureSchema(payload);

      const req = this.createRequest('post', null, options);
      this.transformRelationRequest(req, payload);

      if (typeof this.transformRequest === 'function') {
        this.transformRequest(req);
      }

      if (typeof this.beforeCreate === 'function') {
        await this.beforeCreate(payload, req);
      }

      const trx = await this.origin.post<T, T>(req, payload);

      if (typeof this.transformResponse === 'function') {
        await this.transformResponse(trx);
      }

      if (typeof this.afterCreate === 'function') {
        await this.afterCreate(trx);
      }

      return trx.response.data;
    } catch (error) {
      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }
      throw error;
    }
  }

  /**
   * Update the existing data by performing a PATCH request. If the server doesn't support PATCH, add the
   * noPatch to the config so the request will be a PUT request.
   * @param id - Item ID.
   * @param payload - Data to update the item.
   * @param options - Optional request options.
   */
  public async update(id: string, payload: MetalPartialData<T>, options?: MetalRequestOptions): Promise<void> {
    try {
      this.ensureSchema(payload, true);

      const req = this.createRecordRequest(id, 'patch', {
        payload: { id, ...payload },
        ...(options || {})
      });

      if (typeof this.beforeUpdate === 'function') {
        await this.beforeUpdate(id, payload, req);
      }

      const res = await this.origin.patch<T, MetalPartialData<T>>(req, payload);

      if (
        (this.configs.syncUpdate || (options && options.reSync)) &&
        this.records[id] &&
        this.records[id].status !== 'sync'
      ) {
        this.records[id].fetch().catch(console.error);
      }

      for (const [, query] of Object.entries(this.queries)) {
        for (const record of query.records) {
          if (record.id === id && record.status !== 'sync') {
            record.fetch().catch(console.error);
          }
        }
      }

      if (typeof this.transformResponse === 'function') {
        await this.transformResponse(res);
      }

      if (typeof this.afterUpdate === 'function') {
        await this.afterUpdate(res);
      }
    } catch (error) {
      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }
      throw error;
    }
  }

  /**
   * Delete a single item by performing a DELETE request.
   * @param id - Item ID.
   * @param options - Optional request options.
   */
  public async delete(id: string, options?: MetalRequestOptions): Promise<void> {
    try {
      const req = this.createRecordRequest(id, 'delete', {
        payload: { id },
        ...(options || {})
      });

      if (typeof this.beforeDelete === 'function') {
        await this.beforeDelete(id, req);
      }

      const transaction = await this.origin.delete<T>(req);

      if (this.records[id]) {
        this.records[id].deleted = true;
      }

      for (const [, query] of Object.entries(this.queries)) {
        for (const record of query.records) {
          if (record.id === id) {
            record.deleted = true;
          }
        }
      }

      if (typeof this.transformResponse === 'function') {
        await this.transformResponse(transaction);
      }

      if (typeof this.afterDelete === 'function') {
        await this.afterDelete(transaction);
      }
    } catch (error) {
      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }
      throw error;
    }
  }

  /**
   * Perform a general request for the collection endpoint. Please note that
   * this method doesn't call any hook such transformResponse.
   * @param method - Request method.
   * @param id - Optional record id.
   * @param payload - Optional request payload.
   * @param filters - Optional request filters.
   * @param options - Optional request options.
   * @param returnTransaction - Optional to return the transaction object instead of the response data.
   */
  public async request<R>(method: MetalRequestMethod, {
    id,
    payload,
    filters = {},
    options = {},
    returnTransaction
  }: MetalCollectionRequestConfig<T>): Promise<MetalTransaction<R> | R> {
    try {
      const req = id ? this.createRecordRequest(id, method, options) :
        this.createRequest(method, filters, options);
      const trx = await this.origin.request<R, MetalPartialData<T>>(req, payload);

      if (returnTransaction) {
        return trx;
      }

      return trx.response.data;
    } catch (error) {
      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }

      throw error;
    }
  }

  /**
   * Identify allowed request methods.
   * @param options - Optional request options.
   */
  public async options(options?: MetalRequestOptions): Promise<MetalTransaction<T>> {
    try {
      const req = this.createRequest('options', (options || {}).params, options);
      const transaction = await this.origin.options<T>(req);

      if (typeof this.transformResponse === 'function') {
        await this.transformResponse(transaction);
      }

      return transaction;
    } catch (error) {
      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }

      throw error;
    }
  }

  public async subscribe(id: string, handler: SubscriptionHandler<T>, options?: MetalRequestOptions): Promise<Subscription<T>>;
  public async subscribe(handler: SubscriptionHandler<T>, options?: MetalRequestOptions): Promise<Subscription<T>>;
  /**
   * Subscribe for changes to this endpoint or its child endpoint.
   * @param idHandler - String record ID, or function to handle the event.
   * @param handlerOptions - Function to handle the event (applicable if the first argument is string), or optional request options.
   * @param options - Optional request options, applicable if the first argument is string.
   */
  public async subscribe(idHandler: string | SubscriptionHandler<T>,
                         handlerOptions?: SubscriptionHandler<T> | MetalRequestOptions,
                         options?: MetalRequestOptions): Promise<Subscription<T>> {
    if (typeof idHandler === 'string') {
      const req = this.createRecordRequest(idHandler, 'get', options);
      return await this.origin.subscribe(req.url, handlerOptions as SubscriptionHandler<T>, options);
    } else {
      const req = this.createRequest('get', undefined, options);
      return await this.origin.subscribe(req.url, idHandler, handlerOptions as MetalRequestOptions);
    }
  }

  /**
   * Private method to validate the schema.
   * @param data
   * @param partial
   * @private
   */
  private ensureSchema<D>(data: D | T, partial?: boolean): void {
    const { schemas, strict } = this.configs;

    if (schemas) {
      const validation = validateSchemas(schemas, data, strict, partial);

      if (!validation._valid) {
        throw new SchemaError(validation);
      }
    }
  }

  /**
   * Private method to compose a single item request.
   * @param id
   * @param method
   * @param options
   * @private
   */
  private createRecordRequest(id: string,
                              method: MetalRequestMethod,
                              options?: MetalRequestOptions): MetalRequest {
    const request = this.createRequest(method, (options || {}).params, options);
    request.append({
      type: 'record',
      path: id,
      collection: this.name
    });

    if (typeof this.transformRequest === 'function') {
      this.transformRequest(request);
    }

    return request;
  }

  /**
   * Private method to compose a request object.
   * @param method
   * @param params
   * @param options
   * @private
   */
  private createRequest(method: MetalRequestMethod, params?: MetalRequestParams, options?: MetalRequestOptions): MetalRequest {
    const request = new MetalRequest(method, params, options);
    request.configs = this.configs;

    if (this.configs.headers) {
      Object.assign(request.headers, this.configs.headers);
    }
    if (options && options.headers) {
      Object.assign(request.headers, options.headers);
    }
    if (options && options.params) {
      request.params = { ...request.params || {}, ...options.params };
    }

    request.append({
      type: 'collection',
      path: this.configs.endpoint,
      prefix: this.configs.endpointPrefix
    });

    if (typeof this.transformRequest === 'function') {
      this.transformRequest(request);
    }
    this.transformRelationRequest(request);

    _.set(request.options, 'referrer.collection', this);

    return request;
  }

  /**
   * Private method to transform the relation request.
   * @param request
   * @param payload
   * @private
   */
  private transformRelationRequest(request: MetalRequest, payload?: T) {
    if (this.configs.relations && this.configs.relations.belongsTo) {
      const params = JSON.parse(JSON.stringify(request.params || {}));
      const { where = {} } = params;
      for (const { name, foreignKey } of this.configs.relations.belongsTo) {
        if (where[foreignKey] || params[foreignKey] || (payload && payload[foreignKey])) {
          const collection = this.origin.getCollection(name);

          if (collection) {
            const collectionId = where[foreignKey] || params[foreignKey] || (payload || {})[foreignKey];
            if (typeof collectionId === 'string') {
              request.relationships[foreignKey] = collectionId;

              delete where[foreignKey];
              delete params[foreignKey];

              const parentRequest = collection.createRecordRequest(collectionId, 'get', request.options);
              request.prepend(...parentRequest.segments);
            } else {
              console.warn([
                `Request is belongs to ${foreignKey}, but the provided value is ${typeof collectionId}.`,
                `The value must be a string ID.`,
                `BelongsTo relation of ${foreignKey} ignored.`
              ].join(' '));
            }
          } else {
            const errors = [
              `Collection ${name} is not registered at Origin ${this.origin.name}.`,
              `BelongsTo relation of ${foreignKey} ignored.`
            ];
            console.warn(errors.join(' '));
          }
        }
      }
    }
  }

  /**
   * Private method to transform the relation data.
   * @param record
   * @private
   */
  private transformRelation(record: MetalRecord<T>): void {
    const { hasMany, hasOne } = this.configs.relations || {};

    if (hasMany) {
      for (const { name, localKey } of hasMany) {
        const records = record[localKey];
        if (typeOf(records) === 'array') {
          const collection = this.origin.collection(name);
          if (collection) {
            record[localKey] = new MetalRecordList(...records.map(item => collection.createRecord(item.id, item)));
          } else {
            const errors = [
              `Collection ${name} is not registered at Origin ${this.origin.name}.`,
              `HasMany relation of ${localKey} ignored.`
            ];
            console.warn(errors.join(' '));
          }
        }
      }
    }

    if (hasOne) {
      for (const { name, localKey } of hasOne) {
        const child = record[localKey];
        if (typeOf(child) === 'object') {
          const collection = this.origin.collection(name);
          if (collection) {
            record[localKey] = collection.createRecord(child.id, child);
          } else {
            const errors = [
              `Collection ${name} is not registered at Origin ${this.origin.name}.`,
              `HasOne relation of ${localKey} ignored.`
            ];
            console.warn(errors.join(' '));
          }
        }
      }
    }
  }

  /**
   * Private method to pick a specified fields from the record.
   * @param record
   * @param filters
   * @private
   */
  private selectFields(record: T | T[], filters?: MetalQueryFilters<T>): void {
    if (Array.isArray(record)) {
      for (const rec of record) {
        this.selectFields(rec, filters);
      }
    } else {
      if (filters && filters.fields) {
        const selected = {};

        for (const property of Object.keys(record)) {
          if (filters.fields.includes(property as any)) {
            selected[property] = record[property];
          }
        }

        for (const field of filters.fields) {
          if (typeOf(field) === 'object') {
            for (const [key, fields] of Object.entries(field)) {
              if (typeOf(record[key]) === 'object') {
                this.selectFields(record[key], { fields });
                selected[key] = record[key];
              }
            }
          }
        }

        for (const property of Object.keys(record)) {
          if (property !== 'id' && !selected.hasOwnProperty(property)) {
            delete record[property];
          }
        }
      }

      if (filters && filters.excludeFields) {
        for (const field of filters.excludeFields) {
          if (typeof field === 'string') {
            delete record[field];
          } else {
            for (const [key, excludeFields] of Object.entries(field)) {
              this.selectFields(record[key], { excludeFields });
            }
          }
        }
      }
    }
  }

  /**
   * Optional method to manage the request before sending it.
   * @param request
   * @protected
   */
  protected transformRequest?(request: MetalRequest): void;

  /**
   * Optional method to manage the response before returning it.
   * @param transaction
   * @protected
   */
  protected transformResponse?(transaction: MetalTransaction<T | MetalDataListing<T>>): Promise<void>;

  /**
   * Optional method hook to manage the request before doing a HEAD request.
   * @param request - Request object.
   * @protected
   */
  protected beforeHead?(request: MetalRequest): Promise<void>;

  /**
   * Optional method hook to manage the transaction after doing a HEAD request.
   * @param meta - Meta data.
   * @param transaction - Transaction object.
   * @protected
   */
  protected afterHead?(meta: MetalDataMeta, transaction: MetalTransaction<MetalDataMeta>): Promise<void>;

  /**
   * Optional method hook to manage the request before doing a find request.
   * @param request
   * @protected
   */
  protected beforeFind?(request: MetalRequest): Promise<void>;

  /**
   * Optional method hook to manage the transaction after doing a a find request.
   * @param data
   * @param transaction
   * @protected
   */
  protected afterFind?(data: T[], transaction: MetalTransaction<MetalDataListing<T>>): Promise<void>;

  /**
   * Optional method hook to manage the request before doing a findOne request.
   * @param id
   * @param request
   * @protected
   */
  protected beforeFindOne?(id: string, request?: MetalRequest): Promise<void>;

  /**
   * Optional method hook to manage the transaction after doing a findOne request.
   * @param data
   * @param transaction
   * @protected
   */
  protected afterFindOne?(data: T, transaction: MetalTransaction<T>): Promise<void>;

  /**
   * Optional method hook to manage the request before doing a create request.
   * @param payload
   * @param request
   * @protected
   */
  protected beforeCreate?(payload: T, request: MetalRequest): Promise<void>;

  /**
   * Optional method hook to manage the transaction after doing a create request.
   * @param transaction
   * @protected
   */
  protected afterCreate?(transaction: MetalTransaction<T>): Promise<void>;

  /**
   * Optional method hook to manage the request before doing an update request.
   * @param id
   * @param payload
   * @param request
   * @protected
   */
  protected beforeUpdate?(id: string, payload: MetalPartialData<T>, request: MetalRequest): Promise<void>;

  /**
   * Optional method hook to manage the transaction after doing an update request.
   * @param transaction
   * @protected
   */
  protected afterUpdate?(transaction: MetalTransaction<T | void>): Promise<void>;

  /**
   * Optional method hook to manage the request before doing a delete request.
   * @param id
   * @param request
   * @protected
   */
  protected beforeDelete?(id: string, request: MetalRequest): Promise<void>;

  /**
   * Optional method hook to mange the transaction after doing a delete request.
   * @param transaction
   * @protected
   */
  protected afterDelete?(transaction: MetalTransaction<T | void>);

  /**
   * Optional method hook to handle the errors.
   * @param error
   * @protected
   */
  protected handleError?(error: MetalTransactionError<T>): Promise<void>;
}
