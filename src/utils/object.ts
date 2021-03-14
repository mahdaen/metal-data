/**
 * Inherit value from another object.
 * @param key - Property name to inherit the value from.
 * @param from - Object to inherit the value from.
 * @param into - Object that need inherited value.
 */
export function inherit<F extends object, T extends object>(key: string, from: F, into: T) {
  if (typeof into[key] === 'undefined') {
    Object.defineProperty(into, key, {
      get() {
        return from[key];
      }
    });
  }
}
