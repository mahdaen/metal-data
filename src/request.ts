import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { EventEmitter } from './event';
import {
  HttpRequestHandler,
  MetalCollectionConfig,
  MetalRequestMethod,
  MetalRequestOptions,
  MetalRequestParams,
  MetalTransactionState,
  MetalURLSegment
} from './interface';
import uuid from './uuid';

export class MetalTransaction<T> {
  public id = uuid();
  public status: MetalTransactionState = 'init';
  public statusChange: EventEmitter<MetalTransactionState> = new EventEmitter<MetalTransactionState>();
  public startDate: Date;
  public endDate: Date;
  public response: AxiosResponse<T>;
  public error: MetalTransactionError<T>;

  public get duration(): number {
    return this.endDate.getTime() - this.startDate.getTime();
  }

  constructor(public configs: AxiosRequestConfig,
              public request: MetalRequest) {}

  /**
   * Run the transaction.
   */
  public async run(handler?: HttpRequestHandler<AxiosResponse>): Promise<void> {
    this.status = 'running';
    this.startDate = new Date();
    this.statusChange.emit(this.status);

    try {
      this.response = await handler(this.configs);
      this.endDate = new Date();
      this.status = 'complete';
      this.statusChange.emit(this.status);
    } catch (error) {
      this.response = error.response;
      this.endDate = new Date();
      this.status = 'failed';
      this.statusChange.emit(this.status);
      this.error = new MetalTransactionError<T>(error, this);
      throw this.error;
    }
  }
}

export class MetalTransactionError<T> extends Error {
  public code: number;

  constructor(public error: AxiosError,
              public transaction: MetalTransaction<T>) {
    super(error.message);

    if (error.response) {
      const { status, data } = error.response;

      if (status) {
        this.code = status;
      }

      if (data && data.errors) {
        if (typeof data.errors === 'string') {
          this.message = data.errors;
        } else if (Array.isArray(data.errors)) {
          this.message = data.errors.map(str => str.endsWith('.') ? str : `${str}.`).join(' ');
        } else {
          this.message = JSON.stringify(data.errors);
        }
      }
    }
  }
}

/**
 * A Request Object so the Origin can understand how to send the request.
 */
export class MetalRequest {
  public segments: MetalURLSegment[] = [];
  public headers: {
    [key: string]: string
  } = {};
  public listing?: boolean;
  public configs?: MetalCollectionConfig<any>;
  public relationships: {
    [key: string]: string
  } = {};

  /**
   * Get the composed string URL from the URL segments.
   */
  public get url(): string {
    const segments = this.segments
      .map(segment => segment.path);

    if (this.options.suffix) {
      segments.push(this.options.suffix);
    }
    if (this.options.prefix) {
      segments.splice(0, 0, this.options.prefix);
    }

    if (this.segments[0].prefix) {
      segments.splice(0, 0, this.segments[0].prefix);
    }

    return segments.join('/');
  }

  constructor(public method: MetalRequestMethod,
              public params: MetalRequestParams = {},
              public options: MetalRequestOptions = {}) {}

  /**
   * Append a URL segments.
   * @param segments
   */
  public append(...segments: MetalURLSegment[]): MetalRequest {
    this.segments.push(...segments);
    return this;
  }

  /**
   * Prepend a URL segments.
   * @param segments
   */
  public prepend(...segments: MetalURLSegment[]): MetalRequest {
    this.segments.splice(0, 0, ...segments);
    return this;
  }
}
