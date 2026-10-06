import { lineString, point } from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import { useCallback, useMemo, useState } from 'react'
import { distanceM, type LatLng } from '../lib/geo'
import type { Route } from '../lib/routing'
import { setItemSafe } from '../lib/storage'
import type { Fix } from './useGeolocation'
import type { WalkTarget } from './useWalkPlanner'

export interface ActiveWalk {
  walkId: string
  target: WalkTarget
  stop?: { name: string; lat: number; lng: number; osmId: string; category: string }
  route: Route
  startedAt: number
  /** A stroll that starts and ends where you are, rather than a walk to somewhere. */
  loop?: boolean
}

const KEY = 'wander:active-walk'
/** Within this distance of the destination counts as arrived. */
const ARRIVED_M = 45

function load(): ActiveWalk | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * The walk in progress. Saved to localStorage so it survives iOS closing the app
 * while your phone is locked; progress updates whenever the app is open.
 */
export function useActiveWalk(fix: Fix | null) {
  const [walk, setWalk] = useState<ActiveWalk | null>(load)

  const begin = useCallback((w: ActiveWalk) => {
    // If even this can't be saved, the walk still runs; it just won't survive iOS closing the app.
    setItemSafe(KEY, JSON.stringify(w))
    setWalk(w)
  }, [])

  const end = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* storage blocked */
    }
    setWalk(null)
  }, [])

  const progress = useMemo(() => {
    if (!walk) return null
    const { route } = walk
    const speed = route.durationS > 0 ? route.distanceM / route.durationS : 1.3
    if (!fix) return { remainingM: route.distanceM, remainingS: route.durationS, arrived: false, offRoute: false }
    const here: LatLng = { lat: fix.lat, lng: fix.lng }
    const near = distanceM(here, walk.target) <= Math.max(ARRIVED_M, Math.min(fix.accuracy, 80))
    // A loop starts where it ends, so being back there only counts once you've had time to walk most of it.
    const halfway = Date.now() - walk.startedAt > route.durationS * 500
    const arrived = near && (!walk.loop || halfway)
    const np = nearestPointOnLine(lineString(route.coords), point([fix.lng, fix.lat]), { units: 'meters' })
    let along = np.properties.location ?? 0
    // Near the start of a loop, the nearest point can just as well be its end.
    if (walk.loop && !halfway && along > route.distanceM * 0.75) along = 0
    const remainingM = arrived ? 0 : Math.max(0, route.distanceM - along) + (np.properties.dist ?? 0)
    return { remainingM, remainingS: remainingM / speed, arrived, offRoute: (np.properties.dist ?? 0) > 120 }
  }, [walk, fix])

  return { walk, progress, begin, end }
}
