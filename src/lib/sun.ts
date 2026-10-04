import * as SunCalc from 'suncalc'
import type { LatLng } from './geo'

const DAY_MS = 24 * 3_600_000

/**
 * The next sunset at a place (today's, or tomorrow's once it has passed).
 * Computed on the phone, so it works offline. Null near the poles when the sun
 * doesn't set.
 */
export function nextSunset(at: LatLng, now = new Date()): Date | null {
  for (const offset of [0, 1]) {
    const day = new Date(now.getTime() + offset * DAY_MS)
    const { sunset } = SunCalc.getTimes(day, at.lat, at.lng)
    if (sunset && !Number.isNaN(sunset.getTime()) && sunset.getTime() > now.getTime()) return sunset
  }
  return null
}
