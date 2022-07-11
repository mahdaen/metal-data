import { LogLevel, MetalEvent, Subscription, SubscriptionHandler } from 'metal-event-client';
import { MetalCollection } from './collection';
import { MetalDriver } from './driver';
import {
  MetalActiveRequests,
  MetalData,
  MetalDataListing,
  MetalMiddlewareCursor,
  MetalOriginConfig,
  MetalRequestConfig,
  MetalRequestOptions,
  MetalRequestParams,
  MetalTransactionMiddleware,
  Optional
} from './interface';
import { http } from './middlewares/http';
import { MetalRequest, MetalTransaction, MetalTransactionError } from './request';
import { SchemaError, validateItemSchemas, validateSchemas } from './schema';
import { inherit } from './utils/object';
import { sleep } from './utils/sleep';
import uuid from './uuid';

export class MetalOrigin<D extends MetalDriver = MetalDriver> {
  public name: string;
  public href: string;
  public transactions: MetalTransaction<MetalData | any>[] = [];
  public middlewares: MetalTransactionMiddleware<MetalData | any>[] = [];
  public socketConnected: boolean;

  protected readonly _socket: MetalEvent;
  protected readonly _collections: MetalCollection<MetalData & any, this>[] = [];
  protected readonly _requests: MetalActiveRequests = {};
  protected readonly _subscriptionQueue: Array<() => void> = [];

  constructor(public driver: D,
              public configs: MetalOriginConfig) {
    inherit('persistentCache', driver.configs, configs);
    inherit('memoryCache', driver.configs, configs);
    inherit('syncDelay', driver.configs, configs);

    this.name = configs.name;
    this.href = `${configs.name}://`;

    if (configs.socketURL) {
      this._socket = new MetalEvent({
        baseURL: configs.socketURL,
        clientId: uuid(),
        logLevel: LogLevel.ERROR,
      });
    }
    this.driver.origin(this.name, this);
  }

  /**
   * Create a transaction middleware.
   * @param middlewares - One or more middleware to add.
   */
  public use<T extends MetalData>(...middlewares: MetalTransactionMiddleware<T>[]): this {
    this.middlewares.push(...middlewares);
    return this;
  }

  /**
   * Create a HTTP middleware using an axios instance.
   */
  public http() {
    return http({
      baseURL: this.configs.baseURL,
      headers: this.configs.headers
    });
  }

  /**
   * Connect to a WebSocket server.
   */
  public connect() {
    if (!this.socketConnected) {
      this._socket.disconnected.subscribe(() => {
        this._socket.connect(true);
      });

      this._socket.connected.subscribe(() => {
        if ((this._socket as any).queues.length) {
          (this._socket as any).queues.forEach(queue => queue.resolve());
        }

        if (this._subscriptionQueue.length) {
          for (const subscribe of this._subscriptionQueue) {
            subscribe();
            this._subscriptionQueue.splice(this._subscriptionQueue.indexOf(subscribe), 1);
          }
        }
      });

      this._socket.connect();
      this.socketConnected = true;
    }
  }

  /**
   * Method to get/add a collection. Use a string collection name to get a collection, and use
   * a collection instance to register it.
   * @param collection - Collection name or collection instance.
   */
  public collection<T extends MetalData>(collection: string | MetalCollection<T, this>): MetalCollection<T, this> {
    if (typeof collection === 'string') {
      return this.getCollection(collection);
    } else {
      return this.addCollection<T>(collection);
    }
  }

  /**
   * Method to add/register a collection instance.
   * @param collection
   */
  public addCollection<T extends MetalData>(collection: MetalCollection<T, this>): MetalCollection<T, this> {
    if (!this.getCollection(collection.name)) {
      this._collections.push(collection);
    }

    return this.getCollection(collection.name);
  }

  /**
   * Method to get a collection instance.
   * @param name
   */
  public getCollection<T extends MetalData>(name: string): MetalCollection<T, this> {
    for (const collection of this._collections) {
      if (collection.name === name) {
        return collection;
      }
    }
  }

  /**
   * Method to remove a collection instance.
   * @param name
   */
  public remCollection<T extends MetalData>(name: string | typeof MetalCollection): void {
    this._collections.forEach((collection, i) => {
      if (
        (typeof name === 'string' && collection.name === name) ||
        (typeof name === 'function' && collection instanceof name)
      ) {
        this._collections.splice(i, 1);
      }
    });
  }

  public async head<R>(req: MetalRequest): Promise<MetalTransaction<R>>;
  public async head<R, O = Optional>(url: string, options?: MetalRequestOptions): Promise<MetalTransaction<R>>;
  /**
   * Perform a HEAD request.
   * @param reqUrl - Request object or a string URL.
   * @param options - Optional request options, applicable if the first argument is a string URL.
   */
  public async head<R, O = Optional>(reqUrl: string | MetalRequest, options?: MetalRequestOptions): Promise<MetalTransaction<R>> {
    if (reqUrl instanceof MetalRequest) {
      return await this.request(reqUrl);
    } else {
      const request = new MetalRequest('head', {}, options);
      request.append({ type: 'collection', path: reqUrl });
      return await this.request(request);
    }
  }

  public async get<R>(req: MetalRequest): Promise<MetalTransaction<R>>;
  public async get<R, O = Optional>(url: string,
                                    params?: MetalRequestParams,
                                    options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>>;
  /**
   * Perform a GET request.
   * @param reqUrl - Request object or a string URL.
   * @param params - Optional request params, applicable if the first argument is a string URL.
   * @param options - Optional request options, applicable if the first argument is a string URL.
   */
  public async get<R, O = Optional>(reqUrl: MetalRequest | string,
                                    params?: MetalRequestParams,
                                    options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>> {
    if (reqUrl instanceof MetalRequest) {
      return await this.request(reqUrl);
    } else {
      const request = new MetalRequest('get', params, options);
      request.append({ type: 'collection', path: reqUrl });
      return await this.request(request);
    }
  }

  public async post<R, D>(req: MetalRequest, payload: D): Promise<MetalTransaction<R>>;
  public async post<R, D, O = Optional>(url: string,
                                        payload: D,
                                        options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>>;
  /**
   * Perform a POST request.
   * @param reqUrl - Request object or a string URL.
   * @param payload - Request payload.
   * @param options - Optional request options, applicable if the first argument is a string URL.
   */
  public async post<R, D, O = Optional>(reqUrl: MetalRequest | string,
                                        payload: D,
                                        options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>> {
    if (reqUrl instanceof MetalRequest) {
      return await this.request(reqUrl, payload);
    } else {
      const request = new MetalRequest('post', {}, options);
      request.append({ type: 'record', path: reqUrl });
      return await this.request(request, payload);
    }
  }

  public async put<R, D>(req: MetalRequest, payload: D): Promise<MetalTransaction<R>>;
  public async put<R, D, O = Optional>(url: string,
                                       payload: D,
                                       options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>>;
  /**
   * Perform a PUT request.
   * @param reqUrl - Request object or a string URL.
   * @param payload - Request payload.
   * @param options - Optional request options, applicable if the first argument is a string URL.
   */
  public async put<R, D, O = Optional>(reqUrl: MetalRequest | string,
                                       payload: D,
                                       options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>> {
    if (reqUrl instanceof MetalRequest) {
      return await this.request(reqUrl, options);
    } else {
      const request = new MetalRequest('put', {}, options);
      request.append({ type: 'record', path: reqUrl });
      return await this.request(request, payload);
    }
  }

  public async patch<R, D>(req: MetalRequest, payload: D): Promise<MetalTransaction<R>>;
  public async patch<R, D, O = Optional>(url: string,
                                         payload: D,
                                         options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>>;
  /**
   * Perform a PATCH request.
   * @param reqUrl - Request object or a string URL.
   * @param payload - Request payload.
   * @param options - Optional request options, applicable if the first argument is a string URl.
   */
  public async patch<R, D, O = Optional>(reqUrl: MetalRequest | string,
                                         payload: D,
                                         options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>> {
    if (reqUrl instanceof MetalRequest) {
      return await this.request(reqUrl, payload);
    } else {
      const request = new MetalRequest('patch', {}, options);
      request.append({ type: 'record', path: reqUrl });
      return await this.request(request, payload);
    }
  }

  public async delete<R>(req: MetalRequest): Promise<MetalTransaction<R>>;
  public async delete<R, O = Optional>(url: string, options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>>;
  /**
   * Perform a DELETE request.
   * @param reqUrl - Request object or a string URL.
   * @param options - Optional request options, applicable if the first argument is a string URL.
   */
  public async delete<R, O = Optional>(reqUrl: MetalRequest | string, options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>> {
    if (reqUrl instanceof MetalRequest) {
      return await this.request(reqUrl);
    } else {
      const request = new MetalRequest('delete', {}, options);
      request.append({ type: 'record', path: reqUrl });
      return await this.request(request);
    }
  }

  public async options<R>(req: MetalRequest): Promise<MetalTransaction<R>>;
  public async options<R, O = Optional>(url: string, options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>>;
  /**
   * Perform an OPTIONS request.
   * @param reqUrl - Request object or a string URL.
   * @param options - Optional request options, applicable if the first argument is a string URL.
   */
  public async options<R, O = Optional>(reqUrl: string | MetalRequest, options?: MetalRequestOptions<O>): Promise<MetalTransaction<R>> {
    if (reqUrl instanceof MetalRequest) {
      return await this.request(reqUrl);
    } else {
      const request = new MetalRequest('options', {}, options);
      request.append({ type: 'collection', path: reqUrl });
      return await this.request(request);
    }
  }

  /**
   * Perform a request to the server.
   * @param req - Request object.
   * @param payload - Optional request payload, applicable for POST, PUT, and PATCH requests.
   */
  public async request<R, P>(req: MetalRequest, payload?: P): Promise<MetalTransaction<R>> {
    let reqKey;

    try {
      const configs: MetalRequestConfig = {
        url: req.url,
        method: req.method,
        params: { ...(req.params || {}) },
        headers: { ...(this.configs.headers || {}), ...(req.headers || {}) }
      };

      if (payload) {
        configs.data = payload;
      }

      reqKey = JSON.stringify(configs);
      if (this._requests[reqKey]) {
        const trx = this._requests[reqKey];
        console.warn(`Duplicate request found: ${reqKey}`);
        return await new Promise<MetalTransaction<R>>((resolve, reject) => {
          trx.statusChange.subscribe(() => {
            if (trx.status === 'complete') {
              resolve(trx);
            } else if (trx.status === 'failed') {
              reject(trx.error);
            }
          });
        });
      }

      const transaction = new MetalTransaction<R>(configs, req);
      this._requests[reqKey] = transaction;

      this.transactions.push(transaction);
      this.driver.transactions.push(transaction);
      this.driver.transactionChange.emit(transaction);

      if (typeof this.beforeRequest === 'function') {
        await this.beforeRequest(transaction);
      }

      if (typeof this.driver.beforeTransaction === 'function') {
        await this.driver.beforeTransaction(transaction);
      }

      if (!this.middlewares.length) {
        this.middlewares.push(this.http());
      }

      if (this.configs.slowNetworkSimulation) {
        await sleep(5000);
      }

      if (this.middlewares.length) {
        const middlewares = [...this.middlewares];
        const next: MetalMiddlewareCursor = () => {
          if (middlewares.length) {
            return middlewares.shift()(transaction, next);
          }
        };

        await next();
      }

      if (typeof this.afterRequest === 'function') {
        await this.afterRequest(transaction);
      }

      if (typeof this.driver.afterTransaction === 'function') {
        await this.driver.afterTransaction(transaction);
      }

      if (!this.configs.keepTransactions) {
        this.transactions.splice(this.transactions.indexOf(transaction), 1);
        this.driver.transactions.splice(this.driver.transactions.indexOf(transaction), 1);
      }

      delete this._requests[reqKey];

      this._validate<R>(transaction);

      this.driver.transactionChange.emit(transaction);
      return transaction;
    } catch (error) {
      if (typeof reqKey === 'string') {
        delete this._requests[reqKey];
      }

      if (typeof this.handleError === 'function') {
        await this.handleError(error);
      }

      if (typeof this.driver.handleError === 'function') {
        await this.driver.handleError(error);
      }

      throw error;
    }
  }

  /**
   * Create a websocket subscription to a specific path.
   * @param path - Path to subscribe to.
   * @param handler - Function to handle the event.
   * @param options - Optional request options.
   */
  public async subscribe<R>(path: string, handler: SubscriptionHandler<R>, options?: MetalRequestOptions): Promise<Subscription<R>> {
    const { headers, prefix, suffix } = options || {};

    if (prefix) {
      path = `${prefix}/${path}`;
    }
    if (suffix) {
      path = `${path}/${suffix}`;
    }

    path = path.replace(/[\/]+/g, '/');

    if (this._socket.status !== 'ready') {
      await new Promise(resolve => {
        this._subscriptionQueue.push(() => resolve(null));
      });
    }

    return await this._socket.subscribe(path, (event) => {
      return handler(event);
    }, {
      ...options,
      headers: { ...(this.configs.headers || {}), ...(headers || {}) }
    } as any);
  }

  private _validate<R>(transaction: MetalTransaction<R | MetalDataListing<R>>) {
    const { schemaValidation } = this.configs;
    const { request, response } = transaction;
    const { configs, listing } = request;

    if (configs) {
      const { schemas, strict } = configs;

      if (schemas) {
        let validation;

        if (listing) {
          validation = validateItemSchemas(schemas, (response.data as any).data, strict);
        } else {
          validation = validateSchemas(schemas, response.data, strict);
        }

        if (schemaValidation === 'strict' && !validation._valid) {
          throw new SchemaError(validation);
        }
      }
    }
  }

  protected beforeRequest?<R>(transaction: MetalTransaction<R>): Promise<void>;

  protected afterRequest?<R>(transaction: MetalTransaction<R>): Promise<void>;

  /**
   * Optional method to handle the errors.
   * @param error
   * @protected
   */
  protected handleError?(error: MetalTransactionError<any>): Promise<void>;
}
