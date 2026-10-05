const DAY = 86_400_000

export function startOfDay(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function relativeTime(t: number, now = Date.now()): string {
  const diff = now - t
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`
  if (diff < DAY && startOfDay(t) === startOfDay(now)) return `${Math.floor(diff / 3_600_000)} h ago`
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} wk ago`
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined })
}

export function dayLabel(t: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(t).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: days > 300 ? 'numeric' : undefined,
  })
}

export function timeOfDay(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function duration(ms: number) {
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`
}

/** "Sun 5 Oct" (adds the year when it isn't this year). */
export function shortDate(t: number) {
  const d = new Date(t)
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString(undefined, opts)
}

/** 8200 → "8,200" */
export function steps(n: number) {
  return Math.round(n).toLocaleString()
}
