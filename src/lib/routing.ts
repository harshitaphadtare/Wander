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
