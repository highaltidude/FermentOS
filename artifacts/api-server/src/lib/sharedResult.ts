/**
 * Wrap an expensive read so that callers arriving close together share one
 * run of it: a call made while one is running waits on that run, and a call
 * made within `ttlMs` of a successful run gets its result. A failed run is
 * not kept, so the next call tries again.
 */
export function sharedResult<T>(ttlMs: number, fn: () => Promise<T>, now: () => number = Date.now): () => Promise<T> {
  let pending: Promise<T> | null = null;
  let settledAt = -Infinity;

  return () => {
    // settledAt is Infinity while a run is in flight, so this covers both.
    if (pending && now() - settledAt < ttlMs) return pending;

    settledAt = Infinity;
    const run = fn().then(
      (value) => {
        if (pending === run) settledAt = now();
        return value;
      },
      (err: unknown) => {
        if (pending === run) {
          pending = null;
          settledAt = -Infinity;
        }
        throw err;
      },
    );
    pending = run;
    return run;
  };
}
