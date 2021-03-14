import { typeOf } from './typeof';

/**
 * Convert string to a generic type such boolean, date, etc.
 * @param value
 */
export function strToType(value: any) {
  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    } else if (value === 'false') {
      return false;
    } else if (value === 'null') {
      return null;
    } else if (value === 'undefined') {
      return undefined;
    } else if (Number(value)) {
      return Number(value);
    } else if (new Date(value).getTime()) {
      return new Date(value);
    } else {
      return value;
    }
  } else {
    return value;
  }
}

/**
 * Replace all undefined value inside an object with null.
 * @param target - Object to replace.
 */
export function toNullValue<T>(target: T): T {
  for (const [key, value] of Object.entries(target)) {
    if (typeOf(value) === 'object') {
      target[key] = toNullValue(value);
    } else if (typeOf(value) === 'array') {
      target[key] = toNullItem(value);
    } else {
      if (typeof value === 'undefined' || isNaN(value)) {
        target[key] = null;
      }
    }
  }

  return target;
}

/**
 * Replace undefined values inside an array with null.
 * @param items - Array to replace the undefined values.
 */
export function toNullItem<T>(items: T[]): T[] {
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];

    if (typeOf(item) === 'object') {
      items[i] = toNullValue(item);
    } else if (Array.isArray(item)) {
      items[i] = toNullItem(item) as any;
    } else {
      if (typeof item === 'undefined' || isNaN(item as any)) {
        items[i] = null;
      }
    }
  }

  return items;
}

/**
 * Convert any value that can be converted to a generic type such boolean, date, etc.
 * @param target - Object to convert.
 */
export function typify<T>(target: T): T {
  for (const [key, value] of Object.entries(target)) {
    if (typeOf(value) === 'object') {
      target[key] = typify(value);
    } else if (Array.isArray(value)) {
      target[key] = typifyItem(value);
    } else {
      if (typeof value === 'string') {
        target[key] = strToType(value);
      }
    }
  }

  return target;
}

/**
 * Convert any item that can be converted to a generic type such boolean, date, etc.
 * @param items - Array to convert.
 */
export function typifyItem<T>(items: T[]): T[] {
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];

    if (typeOf(item) === 'object') {
      items[i] = typify(item);
    } else if (Array.isArray(item)) {
      items[i] = typifyItem(item) as any;
    } else {
      if (typeof item === 'string') {
        items[i] = strToType(item);
      }
    }
  }

  return items;
}
