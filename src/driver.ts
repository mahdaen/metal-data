import { EventEmitter } from './event';
import { MetalDriverConfig, MetalOrigins, MetalQueryQueueMeta } from './interface';
import { MetalOrigin } from './origin';
import { MetalQueueStore } from './queue';
import { MetalTransaction, MetalTransactionError } from './request';

declare var window: {
  MetalDrivers: MetalDriver[]
};

export const drivers: MetalDriver[] = [];
export const globalDrivers: MetalDriver[] = [];
window.MetalDrivers = globalDrivers;

export class MetalDriver {
  public name: string;
  public origins: MetalOrigins = {};
  public queue: MetalQueueStore<MetalQueryQueueMeta<any>>;
  public transactions: MetalTransaction<any>[] = [];
  public transactionChange: EventEmitter<MetalTransaction<any>> = new EventEmitter<MetalTransaction<any>>();

  constructor(public configs: MetalDriverConfig = {}) {
    this.name = configs.name || 'default';
    this.queue = new MetalQueueStore({
      name: `${this.name}.queues`,
      limit: configs.queueLimit || 5
    });

    if (configs.global) {
      const gDrivers = globalDrivers.filter(driver => driver.name === this.name);
      if (gDrivers.length) {
        globalDrivers.splice(globalDrivers.indexOf(gDrivers[0]), 1, this);
      } else {
        globalDrivers.push(this);
      }
    }

    const lDrivers = drivers.filter(driver => driver.name === this.name);
    if (lDrivers.length) {
      drivers.splice(drivers.indexOf(lDrivers[0]), 1, this);
    } else {
      drivers.push(this);
    }
  }

  /**
   * Check does the driver has a running transactions.
   */
  public get hasRunningTransactions(): boolean {
    return this.runningTransactions.length > 0;
  }

  /**
   * Return the completed transactions.
   */
  public get completedTransactions(): MetalTransaction<any>[] {
    return this.transactions.filter(t => t.status === 'complete');
  }

  /**
   * Return the failed transactions.
   */
  public get failedTransactions(): MetalTransaction<any>[] {
    return this.transactions.filter(t => t.status === 'failed');
  }

  /**
   * Return the running transactions.
   */
  public get runningTransactions(): MetalTransaction<any>[] {
    return this.transactions.filter(t => t.status === 'running');
  }

  /**
   * Get or add an origin to the driver.
   * @param name - Origin name.
   * @param origin - Origin instance, applicable to add an origin.
   */
  public origin(name: string, origin?: MetalOrigin): MetalOrigin {
    if (origin) {
      this.origins[name] = origin;
    }

    return this.origins[name];
  }

  /**
   * Optional method hook to manage the transaction before it runs.
   * @param transaction
   */
  public beforeTransaction?(transaction: MetalTransaction<any>): Promise<void>;

  /**
   * Optional method hook to manage the transaction after it's done.
   * @param transaction
   */
  public afterTransaction?(transaction: MetalTransaction<any>): Promise<void>;

  /**
   * Optional method hook to handle the transaction errors.
   * @param error
   */
  public handleError?(error: MetalTransactionError<any>): Promise<void>;
}
