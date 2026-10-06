import { distanceM, type LatLng } from './geo'

/**
 * Walking routes.
 *
 * Preferred: openrouteservice via our Cloudflare Worker (VITE_API_URL), which
 * keeps the ORS key out of the front end. Until that's set up (or if the Worker
 * is unreachable) we fall back to the free FOSSGIS OSRM foot router, which needs
 * no key at all.
 */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const OSRM_FOOT = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving'

export interface Route {
  /** [lng, lat] pairs */
  coords: [number, number][]
  distanceM: number
  durationS: number
  /** metres between where the route ends and the real destination, when the very end isn't on mapped paths */
  endGapM?: number
}

export class RoutingError extends Error {}

const cache = new Map<string, Route>()

function cacheKey(points: LatLng[]) {
  return points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
}

export async function walkingRoute(points: LatLng[], signal?: AbortSignal): Promise<Route> {
  const key = cacheKey(points)
  const hit = cache.get(key)
  if (hit) return hit

  let route: Route
  if (API_URL) {
    try {
      route = await viaWorker(points, signal)
    } catch (err) {
      if ((err as Error).name === 'AbortError' || err instanceof RoutingError) throw err
      route = await viaOsrm(points, signal) // Worker unreachable: keep walking anyway
    }
  } else {
    route = await viaOsrm(points, signal)
  }
  route = await unlessDetour(points, route, signal)
  cache.set(key, route)
  return route
}

/**
 * Some destinations sit on paths the router can't reach the right way (a pier
 * under repair, a fenced park), and it sends you on an absurd detour: 18 km to
 * St Kilda Pier from the CBD instead of 6. When a route is far longer than the
 * straight line, also try ending a little short of the destination, on its
 * near side, and keep that if it's much shorter.
 */
async function unlessDetour(points: LatLng[], route: Route, signal?: AbortSignal): Promise<Route> {
  const end = points[points.length - 1]
  const prev = points[points.length - 2]
  const straight = points.slice(1).reduce((sum, p, i) => sum + distanceM(points[i], p), 0)
  if (route.distanceM < straight * 2 + 800) return route
  const toward = (Math.atan2((prev.lng - end.lng) * Math.cos((end.lat * Math.PI) / 180), prev.lat - end.lat) * 180) / Math.PI
  const tries = [150, 350].flatMap((m) => [-45, 0, 45].map((turn) => offset(end, m, toward + turn)))
  const found = await Promise.all(
    tries.map((near) =>
      (API_URL ? viaWorker([...points.slice(0, -1), near], signal) : viaOsrm([...points.slice(0, -1), near], signal)).then(
        (r) => ({ r, gap: distanceM(near, end) }),
        () => null,
      ),
    ),
  )
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const best = found
    .filter((x): x is { r: Route; gap: number } => !!x)
    .sort((a, b) => a.r.distanceM + a.gap - (b.r.distanceM + b.gap))[0]
  if (!best || best.r.distanceM + best.gap > route.distanceM * 0.7) return route
  // Finish the line to the real spot so the map still points at it.
  const extraS = best.gap / 1.33
  return {
    coords: [...best.r.coords, [end.lng, end.lat]],
    distanceM: best.r.distanceM + best.gap,
    durationS: best.r.durationS + extraS,
    endGapM: Math.round(best.gap),
  }
}

async function viaWorker(points: LatLng[], signal?: AbortSignal): Promise<Route> {
  const res = await fetch(`${API_URL}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]) }),
    signal,
  })
  if (res.status === 429) throw new RoutingError("Today's routing limit is used up. Try again tomorrow.")
  if (res.status === 400 || res.status === 404) throw new RoutingError("Couldn't find a walking route there.")
  if (!res.ok) throw new Error(`Route service error (${res.status})`)
  const data = (await res.json()) as { coordinates: [number, number][]; distance: number; duration: number }
  return { coords: data.coordinates, distanceM: data.distance, durationS: data.duration }
}

async function viaOsrm(points: LatLng[], signal?: AbortSignal): Promise<Route> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
  const res = await fetch(`${OSRM_FOOT}/${coords}?overview=full&geometries=geojson`, { signal })
  if (res.status === 429) throw new RoutingError('The route service is busy. Try again in a minute.')
  if (!res.ok) throw new Error(`Route service error (${res.status})`)
  const data = (await res.json()) as {
    code: string
    routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[]
  }
  const r = data.routes?.[0]
  if (data.code !== 'Ok' || !r) throw new RoutingError("Couldn't find a walking route there.")
  return { coords: r.geometry.coordinates, distanceM: r.distance, durationS: r.duration }
}

/** A point `m` metres from `at` on compass bearing `deg`. */
function offset(at: LatLng, m: number, deg: number): LatLng {
  const rad = (deg * Math.PI) / 180
  const dLat = (m * Math.cos(rad)) / 111_320
  const dLng = (m * Math.sin(rad)) / (111_320 * Math.cos((at.lat * Math.PI) / 180))
  return { lat: at.lat + dLat, lng: at.lng + dLng }
}

/**
 * A loop walk of roughly `lengthM` that starts and ends at `start`. `seed`
 * changes the direction, so "Shuffle" gives a different loop.
 *
 * With the Worker this is an openrouteservice round trip. Without it we route
 * through two waypoints that make a triangle; streets add ~30% over straight
 * lines, so the sides are shrunk to match.
 */
export async function loopRoute(start: LatLng, lengthM: number, seed: number, signal?: AbortSignal): Promise<Route> {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/loop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: [start.lng, start.lat], length: Math.round(lengthM), seed }),
        signal,
      })
      if (res.ok) {
        const data = (await res.json()) as { coordinates: [number, number][]; distance: number; duration: number }
        return trimSpurs({ coords: data.coordinates, distanceM: data.distance, durationS: data.duration })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
    }
  }
  const side = lengthM / 3 / 1.3
  const bearing = (seed * 137.5) % 360 // golden angle: successive seeds spread evenly
  const a = offset(start, side, bearing)
  const b = offset(start, side, bearing + 60)
  return trimSpurs(await walkingRoute([start, a, b, start], signal))
}

function pathLength(coords: [number, number][]) {
  let m = 0
  for (let i = 1; i < coords.length; i++) m += distanceM(toLatLng(coords[i - 1]), toLatLng(coords[i]))
  return m
}
const toLatLng = ([lng, lat]: [number, number]): LatLng => ({ lat, lng })

/**
 * A loop's turning points sometimes land at the end of a lane, so the route walks
 * in and straight back out. Cut those out-and-back spurs: wherever the path returns
 * to a point it has already passed (and the detour is a small part of the loop), skip it.
 */
export function trimSpurs(route: Route): Route {
  const c = route.coords
  const total = pathLength(c)
  if (c.length < 4 || total === 0) return route
  const out: [number, number][] = []
  let i = 0
  while (i < c.length) {
    out.push(c[i])
    let skipTo = -1
    let along = 0
    // The last 15% of the loop heads back to the start on purpose; leave it alone.
    for (let j = i + 2; j < c.length && along < total * 0.35; j++) {
      along += distanceM(toLatLng(c[j - 1]), toLatLng(c[j]))
      if (distanceM(toLatLng(c[i]), toLatLng(c[j])) < 4 && j < c.length - 1) skipTo = j
    }
    i = skipTo > 0 ? skipTo + 1 : i + 1
  }
  const kept = pathLength(out)
  // Never trim so much that it stops being a walk worth taking.
  if (out.length < 4 || kept < total * 0.6) return route
  const ratio = kept / total
  return { ...route, coords: out, distanceM: route.distanceM * ratio, durationS: route.durationS * ratio }
}
