import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { MetalTransaction, MetalTransactionError } from '../request';

export function http(configs: AxiosRequestConfig) {
  const client = axios.create(configs);

  return async (trx: MetalTransaction<any>, next) => {
    if (trx.status !== 'complete') {
      try {
        await trx.run(async (configs) => {
          try {
            return await client.request(configs);
          } catch (error) {
            const { message, response } = error as AxiosError;
            const { status, statusText } = response;

            throw new MetalTransactionError(response, message, status, statusText);
          }
        });

        await next();
      } catch (error) {
        throw error;
      }
    }
  }
}
