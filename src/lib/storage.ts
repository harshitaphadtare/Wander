/**
 * localStorage is small (~5 MB) and shared by everything. Caches (Explore
 * results, suburb outlines, weather, nearby areas) can be refetched any time;
 * things like the walk in progress can't. When storage is full, critical writes
 * clear the caches to make room instead of failing.
 */

/** Keys (or key prefixes) that only hold refetchable caches. */
const CACHE_PREFIXES = ['wander:explore-cache', 'wander:suburbs', 'wander:weather', 'wander:areas:']

/** Drop every cache entry. Returns how many keys were removed. */
export function evictCaches(): number {
  let removed = 0
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && CACHE_PREFIXES.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key)
        removed++
      }
    }
  } catch {
    /* storage blocked entirely */
  }
  return removed
}

/**
 * Write something that matters. If storage is full, clear the caches and try
 * once more. Returns false only if it still couldn't be saved.
 */
export function setItemSafe(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    if (!evictCaches()) return false
    try {
      localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
}
