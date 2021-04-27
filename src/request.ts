import { EventEmitter } from './event';
import {
  HttpRequestHandler,
  MetalCollectionConfig,
  MetalRequestConfig,
  MetalRequestMethod,
  MetalRequestOptions,
  MetalRequestParams,
  MetalResponse,
  MetalTransactionState,
  MetalURLSegment
} from './interface';
import uuid from './uuid';

export class MetalTransaction<D> {
  public id = uuid();
  public status: MetalTransactionState = 'init';
  public statusText?: string;
  public statusChange: EventEmitter<MetalTransactionState> = new EventEmitter<MetalTransactionState>();
  public startDate: Date;
  public endDate: Date;
  public response: MetalResponse<D>;
  public error: MetalTransactionError<D>;

  public get duration(): number {
    return this.endDate.getTime() - this.startDate.getTime();
  }

  constructor(public configs: MetalRequestConfig,
              public request: MetalRequest) {}

  /**
   * Run the transaction.
   */
  public async run(handler?: HttpRequestHandler<MetalResponse<D>>): Promise<void> {
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
      this.error = error;
      throw this.error;
    }
  }
}

export class MetalTransactionError<D> extends Error {
  constructor(public request: MetalRequest,
              public response: MetalResponse<D>,
              public message: string,
              public code: number,
              public statusText?: string) {
    super(message);
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
