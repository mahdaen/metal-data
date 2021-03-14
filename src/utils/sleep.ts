/**
 * A simple promise based setTimout.
 * @example
 * ```typescript
 * // Using standard timeout.
 * setTimeout(async() => {
 *   await record.save();
 * }, 3000);
 *
 * // Using sleep.
 * await sleep(3000);
 * await record.save();
 * ```
 * @param timeout - Sleep duration in milliseconds.
 */
export function sleep(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}
