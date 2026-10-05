import type { LatLng } from './geo'

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
  cache.set(key, route)
  return route
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
        return { coords: data.coordinates, distanceM: data.distance, durationS: data.duration }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
    }
  }
  const side = lengthM / 3 / 1.3
  const bearing = (seed * 137.5) % 360 // golden angle: successive seeds spread evenly
  const a = offset(start, side, bearing)
  const b = offset(start, side, bearing + 60)
  return walkingRoute([start, a, b, start], signal)
}
