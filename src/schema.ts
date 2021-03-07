import { SchemaErrorContext } from './interface';

/**
 * Error class to give more information about the error when validating Schema.
 */
export class SchemaError extends Error {
  /**
   * Create new error instance.
   * @param context Error context of the schema error.
   */
  constructor(public context: SchemaErrorContext) {
    super(`Schema Error: ${JSON.stringify(context)}`);
  }
}

