/** Tiny pub/sub so data writes can nudge the sync engine without importing it. */
type Listener = () => void
const listeners = new Set<Listener>()

export function onLocalChange(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function notifyLocalChange() {
  for (const fn of listeners) fn()
}
