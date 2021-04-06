import {
  ItemSchemaValidations,
  KeyOf,
  MetalData,
  SchemaDefinition,
  SchemaDefinitions,
  SchemaValidation,
  SchemaValidations
} from './interface';
import { typeOf } from './utils/typeof';

const schemaProps: KeyOf<SchemaDefinition>[] = [
  '_type', '_required', '_generated', '_default', '_min', '_max'
];

/**
 * Validate schema of a value.
 * @param schema - Schema definition.
 * @param value - Value to validate.
 * @param typeOnly - Ignore the required check.
 */
export function validateSchema(schema: SchemaDefinition,
                               value: any,
                               typeOnly?: boolean): SchemaValidation {
  const { _type, _enums, _required, _generated, _default, _min, _max } = schema;

  if (_type) {
    if (typeof value === 'undefined') {
      if (!typeOnly && (_required || _generated)) {
        if (typeof _default !== 'undefined') {
          if (typeof _default === 'function') {
            return { _valid: true, _value: _default(value) };
          } else {
            return { _valid: true, _value: JSON.parse(JSON.stringify(_default)) };
          }
        } else {
          return {
            _valid: false,
            _expected: _type,
            _given: value,
            _message: 'Missing required field.'
          };
        }
      } else {
        return { _valid: true };
      }
    }

    if (_type !== 'enum' && _type !== typeOf(value)) {
      return {
        _valid: false,
        _expected: _type,
        _given: value,
        _message: 'Invalid field type.'
      };
    }

    if (_type === 'enum') {
      if (Array.isArray(_enums)) {
        if (!_enums.includes(value)) {
          return {
            _valid: false,
            _expected: `${_enums.join(' | ')}`,
            _given: value,
            _message: 'Unknown enum value.'
          };
        }
      } else {
        throw new Error('Invalid Schema: Type enum requires _enums to declare the values.');
      }
    }
    if (_type === 'string' && _min && value.length < _min) {
      return {
        _valid: false,
        _expected: _min,
        _given: value.length,
        _message: 'Value under the minimum length.'
      };
    }

    if (_type === 'string' && _max && value.length > _max) {
      return {
        _valid: false,
        _expected: _max,
        _given: value.length,
        _message: 'Value above the maximum length.'
      };
    }

    if (_type === 'number' && _min && value < _min) {
      return {
        _valid: false,
        _expected: _min,
        _given: value,
        _message: 'Value under the minimum.'
      };
    }

    if (_type === 'number' && _min && value > _min) {
      return {
        _valid: false,
        _expected: _max,
        _given: value,
        _message: 'Value above the maximum.'
      };
    }
  } else {
    throw new Error('Schema Error: The given schema is not a valid schema definitions.');
  }

  return { _valid: true };
}

/**
 * Validate schema of an object.
 * @param schema - Schema definitions.
 * @param data - Data to validate.
 * @param strict - Do not allow properties that not defined on the schema.
 * @param partial - Ignore the required check.
 */
export function validateSchemas<T extends MetalData>(schema: SchemaDefinitions<T>,
                                                     data: T,
                                                     strict?: boolean,
                                                     partial?: boolean): SchemaValidations<T> {
  let _valid = true;
  const validations: SchemaValidations<T> = {} as SchemaValidations<T>;

  for (const [key, value] of Object.entries(data)) {
    if (!schema[key] && strict) {
      _valid = false;
      validations[key] = {
        _valid: false,
        _expected: 'undefined',
        _give: value,
        _message: 'Unknown field.'
      };
    }
  }

  for (const [key, sch] of Object.entries(schema)) {
    if (!schemaProps.includes(key as any)) {
      const { _type } = sch as SchemaDefinition;
      const validation = validateSchema(sch, data[key], partial);

      if (!validation._valid) {
        _valid = false;
      }

      if (validation._value) {
        data[key] = validation._value;
      }

      validations[key] = validation;

      if (_type === 'object' && typeOf(data[key]) === 'object') {
        Object.assign(validations[key], validateSchemas(sch, data[key], strict, partial));
      }

      if (_type === 'array' && Array.isArray(data[key])) {
        validations[key] = validateItemSchemas(sch, data[key], strict, partial);

        if (!validations[key]._valid) {
          _valid = false;
        }
      }
    }
  }

  return { ...validations, _valid };
}

/**
 * Validate schema for object inside an array.
 * @param schema - Schema definitions.
 * @param data - Data to validate.
 * @param strict - Do not allow properties that not defined on the schema.
 * @param partial - Ignore the required check.
 */
export function validateItemSchemas<T>(schema: SchemaDefinitions<T>,
                                       data: T[],
                                       strict?: boolean,
                                       partial?: boolean): ItemSchemaValidations<T> {
  const validations: ItemSchemaValidations<T> = data.map(d => validateSchemas(schema, d, strict, partial)) as any;
  validations._valid = validations.filter(v => !(v as any)._valid).length <= 0;
  return validations;
}

/**
 * Error class to give more information about the error when validating Schema.
 */
export class SchemaError extends Error {
  /**
   * Create new error instance.
   * @param context Validation context of the schema error.
   */
  constructor(public context: SchemaValidations<any>) {
    super(`Schema Error!`);
  }
}
