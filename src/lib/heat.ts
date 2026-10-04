import type { Place, Visit } from './db'
import { periodStart, type Period } from './periods'

export interface HeatSummary {
  data: GeoJSON.FeatureCollection<GeoJSON.Point, { w: number }>
  visits: number
  places: number
  /** where you spent the most time this period */
  top?: { name: string; visits: number }
  /** [lng, lat] of every visited place, for fitting the view */
  coords: [number, number][]
}

/**
 * One heat point per visit, weighted by time spent: a quick check-in counts 1,
 * an hour-long stay counts 2, capped at 4 so one long afternoon doesn't drown
 * out everywhere else.
 */
function weight(v: Visit) {
  if (!v.leftAt) return 1
  const mins = (v.leftAt - v.arrivedAt) / 60_000
  return Math.min(4, Math.max(0.5, mins / 30))
}

export function heatFor(visits: Visit[], places: Map<string, Place>, period: Period): HeatSummary {
  const from = periodStart(period)
  const features: HeatSummary['data']['features'] = []
  const perPlace = new Map<string, { visits: number; weight: number }>()
  for (const v of visits) {
    if (v.arrivedAt < from) continue
    const p = places.get(v.placeId)
    if (!p) continue
    const w = weight(v)
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { w } })
    const s = perPlace.get(p.id) ?? { visits: 0, weight: 0 }
    s.visits++
    s.weight += w
    perPlace.set(p.id, s)
  }
  let top: HeatSummary['top']
  let best = 0
  for (const [id, s] of perPlace) {
    if (s.weight > best) {
      best = s.weight
      top = { name: places.get(id)!.name, visits: s.visits }
    }
  }
  return {
    data: { type: 'FeatureCollection', features },
    visits: features.length,
    places: perPlace.size,
    top,
    coords: [...perPlace.keys()].map((id) => {
      const p = places.get(id)!
      return [p.lng, p.lat]
    }),
  }
}
