import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LatLng } from '../lib/geo'
import { foodNearLine, type OsmPoi } from '../lib/overpass'
import { RoutingError, walkingRoute, type Route } from '../lib/routing'
import { evaluateStops, loadOpeningHours, type OpeningHours, type Stop } from '../lib/stops'
import { nextSunset } from '../lib/sun'

export interface WalkTarget {
  name: string
  lat: number
  lng: number
  category?: string
  address?: string
  osmId?: string
  /** set when walking to one of your saved places */
  placeId?: string
}

export interface WalkPlan {
  target: WalkTarget
  origin: LatLng
}

/** Stops are found within this distance of the route (spec: ~150 m). */
const STOP_RADIUS_M = 150

function friendly(err: unknown, fallback: string) {
  if (err instanceof RoutingError) return err.message
  return navigator.onLine ? fallback : "You're offline."
}

/**
 * Everything the walk planner needs: the base route, places along it, the chosen
 * stop (and the reshaped route through it) and the departure time used to work
 * out which places will be open when you walk past.
 */
export type HoursStatus = 'loading' | 'ok' | 'unavailable'

/**
 * When the walk happens. "Arrive by" works backwards from the arrival time
 * (or the next sunset at the destination) to tell you when to leave.
 */
export type Timing = { mode: 'now' } | { mode: 'leave'; at: Date } | { mode: 'arrive'; at: Date } | { mode: 'sunset' }

export function useWalkPlanner(
  plan: WalkPlan | null,
  /** Instant fallback: places read from the map tiles (no opening hours). */
  tilePois?: (coords: [number, number][], radiusM: number) => Promise<OsmPoi[]>,
) {
  const [base, setBase] = useState<Route | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [pois, setPois] = useState<OsmPoi[] | null>(null)
  const [stopsError, setStopsError] = useState<string | null>(null)
  const [hoursStatus, setHoursStatus] = useState<HoursStatus>('loading')
  const [stop, setStop] = useState<Stop | null>(null)
  const [via, setVia] = useState<Route | null>(null)
  const [viaLoading, setViaLoading] = useState(false)
  const [timing, setTiming] = useState<Timing>({ mode: 'now' })
  const [OH, setOH] = useState<OpeningHours | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const planKey = plan
    ? `${plan.origin.lat},${plan.origin.lng}>${plan.target.lat},${plan.target.lng}`
    : null

  // New destination: start over.
  useEffect(() => {
    setBase(null)
    setRouteError(null)
    setPois(null)
    setStopsError(null)
    setHoursStatus('loading')
    setStop(null)
    setVia(null)
    setTiming({ mode: 'now' })
  }, [planKey])

  // Base route.
  useEffect(() => {
    if (!plan) return
    const ctrl = new AbortController()
    walkingRoute([plan.origin, plan.target], ctrl.signal)
      .then(setBase)
      .catch((err) => {
        if (!ctrl.signal.aborted) setRouteError(friendly(err, "Couldn't get a walking route right now."))
      })
    return () => ctrl.abort()
    // planKey captures the plan's coordinates; `attempt` re-runs on Retry.
  }, [planKey, attempt])

  // Places along the route: map tiles answer instantly, Overpass follows with
  // opening hours (and replaces the tile list when it arrives).
  useEffect(() => {
    if (!base) return
    const ctrl = new AbortController()
    let overpassOk = false
    setHoursStatus('loading')
    // Wrap in a function: passing a class straight to setState would call it as an updater.
    void loadOpeningHours()
      .then((cls) => setOH(() => cls))
      .catch(() => setOH(null))

    const fromTiles = (tilePois?.(base.coords, STOP_RADIUS_M) ?? Promise.resolve([])).catch(() => [] as OsmPoi[])
    void fromTiles.then((found) => {
      if (!ctrl.signal.aborted && !overpassOk) setPois(found)
    })

    foodNearLine(base.coords, STOP_RADIUS_M, ctrl.signal)
      .then((found) => {
        overpassOk = true
        setPois(found)
        setHoursStatus('ok')
      })
      .catch(async (err) => {
        if (ctrl.signal.aborted) return
        setHoursStatus('unavailable')
        // The tile list stands in; it's only an error if that's unavailable too.
        const found = await fromTiles
        if (!ctrl.signal.aborted && found.length === 0 && !tilePois)
          setStopsError(friendly(err, "Couldn't load cafés along the way. The places service is busy."))
      })
    return () => ctrl.abort()
    // tilePois is a stable map-handle call; re-run only for a new route or Retry.
  }, [base, attempt])

  // Reshape the route through the chosen stop.
  useEffect(() => {
    if (!plan || !stop) {
      setVia(null)
      return
    }
    const ctrl = new AbortController()
    setViaLoading(true)
    walkingRoute([plan.origin, stop, plan.target], ctrl.signal)
      .then(setVia)
      .catch(() => {
        if (!ctrl.signal.aborted) setVia(null)
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setViaLoading(false)
      })
    return () => ctrl.abort()
  }, [planKey, stop?.osmId])

  // "Leave now", "leave in 12 min" and tonight's sunset all drift with the clock.
  useEffect(() => {
    if (!plan) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [plan])

  const route = (stop && via) || base
  const targetLat = plan?.target.lat
  const targetLng = plan?.target.lng
  const sunset = useMemo(
    () => (targetLat === undefined || targetLng === undefined ? null : nextSunset({ lat: targetLat, lng: targetLng }, new Date(now))),
    // Cheap maths; re-running with the clock rolls over to tomorrow once it's set.
    [targetLat, targetLng, now],
  )

  const arriveBy = timing.mode === 'arrive' ? timing.at : timing.mode === 'sunset' ? sunset : null
  const leaveAt = useMemo(() => {
    if (timing.mode === 'leave') return timing.at
    // Too late to make it? Then you're leaving now, and arriving late.
    if (arriveBy && route) return new Date(Math.max(now, arriveBy.getTime() - route.durationS * 1000))
    return new Date(now)
  }, [timing, arriveBy, route, now])
  const arriveAt = route ? new Date(leaveAt.getTime() + route.durationS * 1000) : null

  const stops = useMemo(
    () => (pois && base ? evaluateStops(pois, base, leaveAt, OH) : null),
    [pois, base, leaveAt, OH],
  )

  const retry = useCallback(() => {
    setRouteError(null)
    setStopsError(null)
    setAttempt((a) => a + 1)
  }, [])

  return {
    route,
    base,
    via,
    viaLoading,
    routeError,
    stops,
    stopsError,
    hoursStatus,
    stop,
    setStop,
    timing,
    setTiming,
    leaveAt,
    arriveAt,
    arriveBy,
    sunset,
    now,
    retry,
    /** extra time the chosen stop adds, once its route is known */
    extraS: stop && via && base ? Math.max(0, via.durationS - base.durationS) : null,
  }
}

export type WalkPlanner = ReturnType<typeof useWalkPlanner>
