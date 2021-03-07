export function inherit<F extends object, T extends object>(key: string, from: F, into: T) {
  if (typeof into[key] === 'undefined') {
    Object.defineProperty(into, key, {
      get() {
        return from[key];
      }
    });
  }
}
