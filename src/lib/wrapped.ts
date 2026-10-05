import type { PlaceWithStats } from '../hooks/useData'
import type { Visit, Walk } from './db'
import { prettyKind } from './explore'
import type { WrappedInput } from './ai'

/**
 * Wander Wrapped: a monthly or yearly recap worked out on the phone. Gemini
 * (optional) only turns these numbers into a short paragraph.
 */

export type WrappedPeriod = 'month' | 'year'

export interface Wrapped extends WrappedInput {
  /** e.g. "October 2026" */
  label: string
  key: string
  topPlaceVisits: number
  /** visits per day of week, Mon → Sun */
  byWeekday: number[]
  busiestDay?: string
  firstVisitAt?: number
  /** steps logged on visits in the period */
  steps: number
}

export function wrappedRange(period: WrappedPeriod, offset = 0, now = new Date()) {
  const start = period === 'month' ? new Date(now.getFullYear(), now.getMonth() + offset, 1) : new Date(now.getFullYear() + offset, 0, 1)
  const end = period === 'month' ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : new Date(start.getFullYear() + 1, 0, 1)
  const label =
    period === 'month' ? start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : String(start.getFullYear())
  const key = period === 'month' ? `${start.getFullYear()}-${start.getMonth() + 1}` : String(start.getFullYear())
  return { from: start.getTime(), to: end.getTime(), label, key }
}

/** Suburb-ish area from a stored address ("12 Lygon St, Carlton, Melbourne" → "Carlton"). */
function areaOf(p: PlaceWithStats): string | undefined {
  const parts = p.address?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  return parts.find((s) => !/\d/.test(s))
}

const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']

export function computeWrapped(
  period: WrappedPeriod,
  visits: Visit[],
  places: PlaceWithStats[],
  walks: Walk[],
  streakWeeks: number,
  offset = 0,
): Wrapped {
  const { from, to, label, key } = wrappedRange(period, offset)
  const byId = new Map(places.map((p) => [p.id, p]))
  const inRange = visits.filter((v) => v.arrivedAt >= from && v.arrivedAt < to && byId.has(v.placeId))

  const firstEver = new Map<string, number>()
  for (const v of visits) firstEver.set(v.placeId, Math.min(firstEver.get(v.placeId) ?? Infinity, v.arrivedAt))
  const newIds = [...firstEver.entries()].filter(([id, t]) => t >= from && t < to && byId.has(id)).map(([id]) => id)

  // Areas you'd never checked in at before this period.
  const seenBefore = new Set<string>()
  for (const v of visits) if (v.arrivedAt < from) { const a = byId.get(v.placeId) && areaOf(byId.get(v.placeId)!); if (a) seenBefore.add(a) }
  const newAreas = [...new Set(newIds.map((id) => areaOf(byId.get(id)!)).filter((a): a is string => !!a && !seenBefore.has(a)))]

  const perPlace = new Map<string, number>()
  const perCat = new Map<string, number>()
  const byWeekday = [0, 0, 0, 0, 0, 0, 0]
  for (const v of inRange) {
    perPlace.set(v.placeId, (perPlace.get(v.placeId) ?? 0) + 1)
    const c = byId.get(v.placeId)!.category
    if (c) perCat.set(c, (perCat.get(c) ?? 0) + 1)
    byWeekday[(new Date(v.arrivedAt).getDay() + 6) % 7]++
  }
  const top = [...perPlace.entries()].sort((a, b) => b[1] - a[1])[0]
  const topCat = [...perCat.entries()].sort((a, b) => b[1] - a[1])[0]
  const busiest = byWeekday.indexOf(Math.max(...byWeekday))

  const walkedKm =
    walks.filter((w) => !w.deleted && w.startedAt >= from && w.startedAt < to && (w.arrived || w.endedAt)).reduce((s, w) => s + w.distanceM, 0) /
    1000

  return {
    period: label,
    label,
    key,
    visits: inRange.length,
    places: perPlace.size,
    newPlaces: newIds.length,
    newAreas: newAreas.slice(0, 6),
    topPlace: top ? byId.get(top[0])!.name : undefined,
    topPlaceVisits: top?.[1] ?? 0,
    topCategory: topCat ? prettyKind(topCat[0]) : undefined,
    walkedKm: Math.round(walkedKm * 10) / 10,
    streakWeeks,
    byWeekday,
    busiestDay: inRange.length ? WEEKDAYS[busiest] : undefined,
    firstVisitAt: inRange.at(-1)?.arrivedAt,
    steps: inRange.reduce((sum, v) => sum + (v.steps ?? 0), 0),
  }
}

/** The recap paragraph when Gemini isn't available. */
export function fallbackStory(w: Wrapped): string {
  if (!w.visits) return `A quiet ${w.label.includes(' ') ? 'month' : 'year'}. Your map is ready when you are.`
  const bits = [
    `You checked in ${w.visits} ${w.visits === 1 ? 'time' : 'times'} across ${w.places} ${w.places === 1 ? 'place' : 'places'}`,
    w.newPlaces ? `and found ${w.newPlaces} new ${w.newPlaces === 1 ? 'spot' : 'spots'}` : '',
  ]
  let s = bits.filter(Boolean).join(' ') + '.'
  if (w.topPlace && w.topPlaceVisits >= 2) s += ` ${w.topPlace} was your place, with ${w.topPlaceVisits} visits.`
  if (w.newAreas.length) s += ` You wandered into ${w.newAreas.slice(0, 2).join(' and ')} for the first time.`
  if (w.walkedKm >= 1) s += ` And you walked ${w.walkedKm} km on planned walks.`
  return s
}
