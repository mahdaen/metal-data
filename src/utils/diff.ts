import { typeOf } from './typeof';

/**
 * Get the changed values between two strings.
 *
 * @param target - The current string to compare with.
 * @param source - The source string to compare from.
 */
export function diff(target: string, source: string): string[];
/**
 * Get the changed values between two dates.
 *
 * @param target - The current date to compare with.
 * @param source - The source date to compare from.
 */
export function diff(target: Date, source: Date): DateChanges;
/**
 * Get the changed values between two arrays.
 *
 * @param target - The current array to compare with.
 * @param source - The source array to compare from.
 */
export function diff<T, R = PartialObject<T>>(target: T[], source: T[]): R[];
/**
 * Get the changed values between two objects.
 *
 * @param target - The current object to compare with.
 * @param source - The source object to compare from.
 * @param deepArray - Perform a deep difference to a value with array type.
 */
export function diff<T, R = PartialObject<T>>(target: T, source: T, deepArray?: boolean): R;
export function diff<T>(target: T[] | T | Date | string, source: T[] | T | Date | string, deepArray?: boolean)
  : string[] | DateChanges | T[] | T {
  const type = typeOf(target);

  if (type !== typeOf(source)) {
    throw new Error('Diff Error: Target and Source must be on the same type!');
  }

  switch (type) {
    case 'array':
      return arrayDiff(target as any, source as any) as any;
    case 'object':
      return objectDiff(target, source, deepArray) as any;
    case 'date':
      return dateDiff(target as any, source as any) as any;
    case 'string':
      return stringDiff(target as any, source as any) as any;
    default:
      break;
  }
}

/**
 * Get a difference of two objects. The function will not compare the sub-object or sub-array.
 * @param target - Object to compare with.
 * @param source - Object to compare from.
 */
export function quickDiff<T>(target: T, source: T): PartialObject<T>;
/**
 * Get a comparison of two objects. The function will not compare the sub-object or sub-array.
 * @param target - Object to compare with.
 * @param source - Object to compare from.
 * @param comparison - A comparison reference.
 */
export function quickDiff<T>(target: T, source: T, comparison?: boolean): ObjectDifference<T>;
export function quickDiff<T>(target: T, source: T, comparison?: boolean): PartialObject<T> | ObjectDifference<T> {
  const origins = {};
  const changes = {};

  for (const [key, value] of Object.entries(target)) {
    if (value !== source[key]) {
      origins[key] = target[key];
      changes[key] = source[key];
    }
  }

  if (comparison) {
    return { origins, changes };
  }

  return changes;
}

/**
 * Get the comparison of two strings.
 *
 * @param target - The current string to compare with.
 * @param source - The source string to compare from.
 */
export function compare(target: string, source: string): StringDifference;
/**
 * Get the comparison of two dates.
 *
 * @param target - The current date to compare with.
 * @param source - The source date to compare from.
 */
export function compare(target: Date, source: Date): DateDifference;
/**
 * Get the comparison of two arrays.
 *
 * @param target - The current array to compare with.
 * @param source - The source array to compare from.
 */
export function compare<T>(target: T[], source: T[]): ArrayDifference<T>;
/**
 * Get the comparison of two objects.
 *
 * @param target - The current object to compare with.
 * @param source - The source object to compare from.
 * @param deepArray - Perform a deep difference to a value with array type.
 */
export function compare<T>(target: T, source: T, deepArray?: boolean): ObjectDifference<T>;
/**
 * Get the comparison of two objects.
 *
 * @param target - The current object to compare with.
 * @param source - The source object to compare from.
 * @param deepArray - Perform a deep difference to a value with array type.
 */
export function compare<T>(target: string | Date | T[] | T, source: string | Date | T[] | T, deepArray?: boolean)
  : StringDifference | DateDifference | ArrayDifference<T> | ObjectDifference<T> {
  const type = typeOf(target);

  if (type !== typeOf(source)) {
    throw new Error('Compare Error: Target and Source must be on the same type!');
  }

  switch (type) {
    case 'string':
      return stringDiff(target as string, source as string, true) as any;
    case 'date':
      return dateDiff(target as Date, source as Date, true) as any;
    case 'object':
      return objectDiff(target, source, deepArray, true) as any;
    case 'array':
      return arrayDiff(target as any, source as any, true) as any;
    default:
      break;
  }
}

export type PartialObject<T> = {
  [K in keyof T]?: T[K];
};

export interface ObjectDifference<T> {
  origins: PartialObject<T>; // Original data reference.
  changes: PartialObject<T>; // Changed data reference.
}

/**
 * Get the deep difference of two Objects.
 *
 * @param target - The current object to compare with.
 * @param source - The source object to compare from.
 * @param deepArray - Perform a deep difference to a value with array type.
 */
export function objectDiff<T>(target: T, source: T, deepArray?: boolean): T;
/**
 * Get the deep difference of two Objects.
 *
 * @param target - The current object to compare with.
 * @param source - The source object to compare from.
 * @param deepArray - Perform a deep difference to a value with array type.
 * @param comparison - Return a comparison object.
 */
export function objectDiff<T>(target: T, source: T, deepArray?: boolean, comparison?: boolean): ObjectDifference<T>;
export function objectDiff<T>(target: T, source: T, deepArray?: boolean, comparison?: boolean): T | ObjectDifference<T> {
  const origins = {};
  const changes = {};

  for (const [key, value] of Object.entries(target)) {
    if (typeof value !== typeof source[key]) {
      origins[key] = value;
      changes[key] = source[key];
    } else {
      if (typeOf(value) === 'array') {
        if (deepArray) {
          const arrChanges = arrayDiff(value, source[key], true);

          if (arrChanges.changes.filter(item => item).length) {
            origins[key] = arrChanges.origins;
            changes[key] = arrChanges.changes;
          }
        } else {
          if (JSON.stringify(value) !== JSON.stringify(source[key])) {
            origins[key] = value;
            changes[key] = source[key];
          }
        }
      } else if (typeOf(value) === 'object') {
        const objChanges = objectDiff(value, source[key], deepArray, true);

        if (Object.keys(objChanges.changes).length) {
          origins[key] = objChanges.origins;
          changes[key] = objChanges.changes;
        }
      } else if (typeOf(value) === 'date') {
        const tDate = new Date(value).toISOString();
        const sDate = new Date(source[key]).toISOString();

        if (tDate !== sDate) {
          origins[key] = value;
          changes[key] = source[key];
        }
      } else {
        if (value !== source[key]) {
          origins[key] = value;
          changes[key] = source[key];
        }
      }
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (!target.hasOwnProperty(key)) {
      changes[key] = value;
    }
  }

  if (comparison) {
    return { origins, changes } as ObjectDifference<T>;
  }

  return changes as T;
}

export interface ArrayDifference<T> {
  origins: T[]; // Original data reference.
  changes: T[]; // Changed data reference.
}

/**
 * Get the deep difference of two Arrays.
 *
 * @param target - The current array to compare with.
 * @param source - The source array to compare from.
 */
export function arrayDiff<T>(target: T[], source: T[]): T[];
/**
 * Get the deep difference of two Arrays.
 *
 * @param target - The current array to compare with.
 * @param source - The source array to compare from.
 * @param comparison - Return a comparison object.
 */
export function arrayDiff<T>(target: T[], source: T[], comparison?: boolean): ArrayDifference<T>;
export function arrayDiff<T>(target: T[], source: T[], comparison?: boolean): T[] | ArrayDifference<T> {
  const origins = [];
  const changes = [];

  target.forEach((item, i) => {
    if (typeOf(item) !== typeOf(source[i])) {
      origins[i] = item;
      changes[i] = source[i];
    } else {
      if (typeOf(item) === 'object') {
        const objChanges = objectDiff(item, source[i], true, true);

        if (Object.keys(objChanges.changes).length) {
          origins[i] = objChanges.origins;
          changes[i] = objChanges.changes;
        }
      } else if (typeOf(item) === 'array') {
        const arrChanges = arrayDiff(item as any, source[i] as any, true);

        if (arrChanges.changes.length) {
          origins[i] = arrChanges.origins;
          changes[i] = arrChanges.changes;
        }
      } else if (typeOf(item) === 'date') {
        const tDate = new Date(item as any).toISOString();
        const sDate = new Date(source[i] as any).toISOString();

        if (tDate !== sDate) {
          origins[i] = item;
          changes[i] = source[i];
        }
      } else {
        if (item !== source[i]) {
          origins[i] = item;

          if (typeof source[i] === 'undefined') {
            changes[i] = null;
          } else {
            changes[i] = source[i];
          }
        } else {
          origins[i] = NaN;
          changes[i] = NaN;
        }
      }
    }
  });

  if (target.length < source.length) {
    for (let i = target.length; i < source.length; ++i) {
      changes.push(source[i]);
    }
  }

  if (comparison) {
    return { origins, changes };
  }

  return changes;
}

export interface StringDifference {
  origins: string[];
  changes: string[];
}

/**
 * Get a deep difference of two Strings.
 *
 * @param target - The current string to compare with.
 * @param source - The source string to compare from.
 */
export function stringDiff(target: string, source: string): string[];
/**
 * Get a deep difference of two Strings.
 *
 * @param target - The current string to compare with.
 * @param source - The source string to compare from.
 * @param comparison - Return a comparison object.
 */
export function stringDiff(target: string, source: string, comparison?: boolean): StringDifference;
export function stringDiff(target: string, source: string, comparison?: boolean): string[] | StringDifference {
  const origins = [];
  const changes = [];

  target.split('').forEach((str, i) => {
    if (str !== source[i]) {
      origins[i] = target[i];

      if (typeof source[i] === 'undefined') {
        changes[i] = null;
      } else {
        changes[i] = source[i];
      }
    } else {
      origins[i] = NaN;
      changes[i] = NaN;
    }
  });

  if (source.length > target.length) {
    for (let i = target.length; i < source.length; ++i) {
      changes[i] = source[i];
    }
  }

  if (comparison) {
    return { origins, changes };
  }

  return changes;
}

export interface DateDifference {
  origins: DateChanges; // Original data reference.
  changes: DateChanges; // Changed data reference.
}

export interface DateChanges {
  year?: number;
  month?: number;
  date?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

/**
 * Get a deep difference of two Date.
 *
 * @param target - The current date to compare with.
 * @param source - The source date to compare from.
 */
export function dateDiff(target: Date, source: Date): DateChanges;
/**
 * Get a deep difference of two Date.
 *
 * @param target - The current date to compare with.
 * @param source - The source date to compare from.
 * @param comparison - Return a comparison object.
 */
export function dateDiff(target: Date, source: Date, comparison?: boolean): DateDifference;
export function dateDiff(target: Date, source: Date, comparison?: boolean): DateChanges | DateDifference {
  const origins: DateChanges = {
    year: target.getFullYear(),
    month: target.getMonth(),
    date: target.getDate(),
    hours: target.getHours(),
    minutes: target.getMinutes(),
    seconds: target.getSeconds(),
    milliseconds: target.getMilliseconds(),
  };
  const changes: DateChanges = {};

  if (origins.year !== source.getFullYear()) {
    changes.year = source.getFullYear();
  }
  if (origins.month !== source.getMonth()) {
    changes.month = source.getMonth();
  }
  if (origins.date !== source.getDate()) {
    changes.date = source.getDate();
  }
  if (origins.hours !== source.getHours()) {
    changes.hours = source.getHours();
  }
  if (origins.minutes !== source.getMinutes()) {
    changes.minutes = source.getMinutes();
  }
  if (origins.seconds !== source.getSeconds()) {
    changes.seconds = source.getSeconds();
  }
  if (origins.milliseconds !== source.getMilliseconds()) {
    changes.milliseconds = source.getMilliseconds();
  }

  if (comparison) {
    return { origins, changes };
  } else {
    return changes;
  }
}
