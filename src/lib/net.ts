/**
 * Every free service Wander leans on (Overpass, Photon, Open-Meteo, the AI
 * Worker) can stall on a phone connection. These helpers put a hard ceiling on
 * each call so no screen ever waits on a spinner indefinitely.
 */

/** A signal that aborts when `parent` does, or after `ms` with a TimeoutError. */
export function timeoutSignal(parent: AbortSignal | undefined, ms: number): { signal: AbortSignal; clear(): void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timed out', 'TimeoutError')), ms)
  const onAbort = () => ctrl.abort(new DOMException('Aborted', 'AbortError'))
  if (parent?.aborted) onAbort()
  else parent?.addEventListener('abort', onAbort, { once: true })
  return {
    signal: ctrl.signal,
    clear() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onAbort)
    },
  }
}

/** Run `task` with a deadline; the task gets a signal that fires at the deadline or when `parent` aborts. */
export async function withTimeout<T>(ms: number, parent: AbortSignal | undefined, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const t = timeoutSignal(parent, ms)
  try {
    return await task(t.signal)
  } finally {
    t.clear()
  }
}

/** Resolves to the promise's value, or `undefined` if it hasn't settled successfully within `ms`. */
export function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        clearTimeout(timer)
        resolve(undefined)
      },
    )
  })
}

/** Rejects with an AbortError as soon as `signal` aborts, so callers stop waiting on work they no longer need. */
export function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

export const isAbort = (err: unknown) => (err as Error)?.name === 'AbortError'
