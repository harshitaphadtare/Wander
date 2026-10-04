import { lineString, point } from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import type OpeningHoursClass from 'opening_hours'
import { timeOfDay } from './format'
import type { OsmPoi } from './overpass'
import type { Route } from './routing'

export type OpeningHours = typeof OpeningHoursClass

/** opening_hours.js is ~1 MB, so it loads only when the walk planner opens. */
export async function loadOpeningHours(): Promise<OpeningHours> {
  return (await import('opening_hours')).default
}

export type StopStatus = 'open' | 'closing' | 'closed' | 'unknown'
export type StopGroup = 'coffee' | 'food' | 'drinks'

export interface Stop extends OsmPoi {
  group: StopGroup
  /** metres along the route where you'd turn off */
  alongM: number
  /** metres from the route */
  offM: number
  /** rough out-and-back detour, refined once the real route is fetched */
  detourS: number
  passAt: Date
  status: StopStatus
  statusText: string
}

export function stopGroup(category: string): StopGroup {
  if (category === 'restaurant' || category === 'fast_food') return 'food'
  if (category === 'pub' || category === 'bar') return 'drinks'
  return 'coffee'
}

const CLOSING_SOON_MS = 30 * 60_000
const DAY_MS = 24 * 3_600_000

/** When you'd reach each place, and whether it'll be open then. */
function hoursAt(value: string | undefined, at: Date, OH: OpeningHours | null): Pick<Stop, 'status' | 'statusText'> {
  if (!value) return { status: 'unknown', statusText: 'Hours not listed' }
  if (!OH) return { status: 'unknown', statusText: 'Checking hours…' }
  try {
    const oh = new OH(value, null)
    if (oh.getUnknown(at)) return { status: 'unknown', statusText: 'Hours unclear' }
    const next = oh.getNextChange(at, new Date(at.getTime() + DAY_MS))
    if (oh.getState(at)) {
      if (next && next.getTime() - at.getTime() < CLOSING_SOON_MS)
        return { status: 'closing', statusText: `Closes ${timeOfDay(next.getTime())}, just after you pass` }
      return { status: 'open', statusText: next ? `Open until ${timeOfDay(next.getTime())}` : 'Open when you pass' }
    }
    return {
      status: 'closed',
      statusText: next ? `Closed when you pass · opens ${timeOfDay(next.getTime())}` : 'Closed when you pass',
    }
  } catch {
    return { status: 'unknown', statusText: 'Hours unclear' }
  }
}

const STATUS_RANK: Record<StopStatus, number> = { open: 0, closing: 0, unknown: 0, closed: 1 }
/** Tie-break within the same detour minute: confirmed-open beats "hours not listed". */
const CONFIDENCE: Record<StopStatus, number> = { open: 0, closing: 1, unknown: 2, closed: 3 }

/**
 * Places along the route, sorted by detour (closed ones sink to the bottom).
 * Walking speed comes from the route itself so times match the summary.
 */
export function evaluateStops(pois: OsmPoi[], route: Route, departAt: Date, OH: OpeningHours | null): Stop[] {
  if (route.coords.length < 2 || route.durationS <= 0) return []
  const line = lineString(route.coords)
  const speed = route.distanceM / route.durationS // m/s
  const stops = pois.map((poi): Stop => {
    const np = nearestPointOnLine(line, point([poi.lng, poi.lat]), { units: 'meters' })
    const alongM = np.properties.location ?? 0
    const offM = np.properties.dist ?? 0
    const passAt = new Date(departAt.getTime() + ((alongM + offM) / speed) * 1000)
    return {
      ...poi,
      group: stopGroup(poi.category),
      alongM,
      offM,
      detourS: (2 * offM) / speed,
      passAt,
      ...hoursAt(poi.openingHours, passAt, OH),
    }
  })
  return stops
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        Math.round(a.detourS / 60) - Math.round(b.detourS / 60) ||
        CONFIDENCE[a.status] - CONFIDENCE[b.status] ||
        a.detourS - b.detourS,
    )
    .slice(0, 60)
}
