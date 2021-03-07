type GenericType = 'string' | 'number' | 'object' | 'array' | 'date' | 'function' | 'boolean';

export function typeOf(object: any): GenericType {
  return toString.call(object).replace('[object ', '').replace(']', '').toLowerCase();
}
