import type { Visit } from './db'

/**
 * Weekly "somewhere new" streak: how many weeks in a row you've visited at least
 * one place for the first time. Worked out from your history whenever the app
 * opens, so it needs no background work or notifications.
 *
 * Weeks start on Monday. The current week only breaks the streak once it's
 * over; until then it shows as "still to do" so you know to get out there.
 */
const WEEK_MS = 7 * 24 * 3_600_000

export function weekStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  const sinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - sinceMonday)
  return d.getTime()
}

export interface Streak {
  /** consecutive weeks with a new place, counting this week if it's done */
  weeks: number
  /** whether this week already has a new place */
  thisWeek: boolean
  /** longest streak ever */
  best: number
  /** the last 8 weeks, oldest first: did each one have a new place? */
  recent: boolean[]
}

export function weeklyStreak(visits: Visit[], now = Date.now()): Streak {
  // First-ever visit to each place = a "new place" in that week.
  const first = new Map<string, number>()
  for (const v of visits) first.set(v.placeId, Math.min(first.get(v.placeId) ?? Infinity, v.arrivedAt))
  const weeks = new Set([...first.values()].map(weekStart))

  // Step week by week via calendar dates so daylight-saving changes can't skew it.
  const shift = (w: number, by: number) => {
    const d = new Date(w)
    d.setDate(d.getDate() + by * 7)
    return d.getTime()
  }

  const current = weekStart(now)
  const thisWeek = weeks.has(current)
  let count = 0
  for (let w = thisWeek ? current : shift(current, -1); weeks.has(w); w = shift(w, -1)) count++

  let best = 0
  let run = 0
  let prev = -Infinity
  for (const w of [...weeks].sort((a, b) => a - b)) {
    run = w - prev <= WEEK_MS + 3_600_000 ? run + 1 : 1 // +1 h tolerates a DST week
    best = Math.max(best, run)
    prev = w
  }

  const recent = Array.from({ length: 8 }, (_, i) => weeks.has(shift(current, i - 7)))
  return { weeks: count, thisWeek, best: Math.max(best, count), recent }
}
