/**
 * Collects phase durations for a Server-Timing header.
 *
 * @typedef {object} Timing
 * @property {<T>(name: string, fn: () => Promise<T>) => Promise<T>} time
 * @property {() => string} header
 */

/** @returns {Timing} */
export function createTiming() {
  /** @type {Array<[string, number]>} */
  const entries = [];
  return {
    async time(name, fn) {
      const started = Date.now();
      try {
        return await fn();
      } finally {
        entries.push([name, Date.now() - started]);
      }
    },
    header() {
      return entries.map(([name, ms]) => `${name};dur=${ms}`).join(", ");
    },
  };
}
