import * as _ from 'lodash';
import { EventEmitter } from './event';
import { MetalPartialQueueData, MetalQueueHandler, MetalQueueStatus, MetalQueueStoreConfig } from './interface';
import { typeOf } from './utils/typeof';
import uuid from './uuid';

export class MetalQueueStore<T> {
  public readonly name: string;
  public queues: MetalQueue<T>[] = [];
  public stateChange: EventEmitter<MetalQueue<T>> = new EventEmitter<MetalQueue<T>>();

  public get idle(): MetalQueue<T>[] {
    return this.queues.filter(q => q.status === 'idle');
  }

  public get running(): MetalQueue<T>[] {
    return this.queues.filter(q => q.status === 'running');
  }

  public get completed(): MetalQueue<T>[] {
    return this.queues.filter(q => q.status === 'complete');
  }

  public get failed(): MetalQueue<T>[] {
    return this.queues.filter(q => q.status === 'failed');
  }

  constructor(public config: MetalQueueStoreConfig = {}) {
    this.name = config.name || 'default';

    if (!config.limit) {
      config.limit = 5;
    }
  }

  public add(data: T, handler: MetalQueueHandler<T>): MetalQueue<T> {
    const queue = new MetalQueue(this, data, handler);
    this.queues.push(queue);
    return queue;
  }

  public rem(id: string): this {
    this.queues.forEach((q, i) => {
      if (q.id === id) {
        this.queues.splice(i, 1);
      }
    });

    return this;
  }

  public start(): this;
  public start(data: T, handler: MetalQueueHandler<T>): MetalQueue<T>;
  public start(data?: T, handler?: MetalQueueHandler<T>): this | MetalQueue<T> {
    if (typeOf(data) === 'object') {
      const queue = this.add(data, handler);
      this._run();
      return queue;
    }

    return this._run();
  }

  public promise(data: T, handler: MetalQueueHandler<T>): Promise<MetalQueue<T>> {
    return this.add(data, handler).promise();
  }

  private _run(): this {
    const { config, idle, running } = this;

    if (idle.length && running.length < config.limit) {
      for (let i = 0; (i < (config.limit - running.length)) && (i < idle.length); ++i) {
        const queue = idle[i];

        queue.start();

        if (config.timeout) {
          setTimeout(() => {
            if (queue.status === 'running') {
              queue.fail('Queue timed out!');
            }
          }, config.timeout);
        }
      }
    }

    return this;
  }
}

export class MetalQueue<T> {
  public id: string = uuid();
  public status: MetalQueueStatus = 'idle';

  public startedAt: Date;
  public finishedAt: Date;

  public statusChange: EventEmitter<MetalQueueStatus> = new EventEmitter<MetalQueueStatus>();
  public stateChange: EventEmitter<this> = new EventEmitter<this>();
  public error: Error;
  public duration: number;

  public get elapsed(): number {
    if (this.startedAt) {
      return new Date().getTime() - this.startedAt.getTime();
    }

    return 0;
  }

  constructor(public store: MetalQueueStore<T>,
              public data: T,
              public handler: MetalQueueHandler<T>) {}

  private _complete(status: MetalQueueStatus): this {
    this.status = status;
    this.finishedAt = new Date();
    this.duration = this.finishedAt.getTime() - this.startedAt.getTime();
    this.statusChange.emit(this.status);

    this.store.stateChange.emit(this);
    this.store.start();

    return this;
  }

  public start(): this {
    this.status = 'running';
    this.startedAt = new Date();
    this.statusChange.emit(this.status);
    this.store.stateChange.emit(this);

    if (typeof this.handler === 'function') {
      this.handler(this);
    }

    return this;
  }

  public finish(): this {
    return this._complete('complete');
  }

  public fail(message?: string): this {
    this.error = new Error(message);
    return this._complete('failed');
  }

  public update(data: MetalPartialQueueData<T>): this {
    _.merge(this.data, data);

    this.stateChange.emit(this);
    this.store.stateChange.emit(this);

    return this;
  }

  public promise(): Promise<this> {
    const promise = new Promise<this>((resolve, reject) => {
      this.statusChange.subscribe(status => {
        if (status === 'complete') {
          resolve(this);
        } else if (status === 'failed') {
          reject(this.error);
        }
      });
    });

    this.store.start();
    return promise;
  }
}
