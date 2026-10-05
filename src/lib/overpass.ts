import simplify from '@turf/simplify'
import { lineString } from '@turf/helpers'

/**
 * Overpass API (OpenStreetMap data): free, no key, fair use. Public instances
 * are often busy, so we ask a few mirrors at once and take the first answer.
 */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const TIMEOUT_MS = 14_000

export interface OsmPoi {
  osmId: string
  name: string
  lat: number
  lng: number
  /** cafe, restaurant, fast_food, bakery, ice_cream, pub, bar */
  category: string
  openingHours?: string
  cuisine?: string
  address?: string
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/** Overpass "around" takes a polyline; keep it short so the query stays small. */
function simplifiedLatLonList(coords: [number, number][], maxPoints = 90): string {
  let line = lineString(coords)
  let tolerance = 0.00005
  while (line.geometry.coordinates.length > maxPoints && tolerance < 0.01) {
    line = simplify(lineString(coords), { tolerance, highQuality: false })
    tolerance *= 2
  }
  return line.geometry.coordinates.map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',')
}

const cache = new Map<string, OsmPoi[]>()

/** Named cafés, restaurants, bakeries and bars within `radiusM` of a route line. */
export async function foodNearLine(coords: [number, number][], radiusM = 150, signal?: AbortSignal): Promise<OsmPoi[]> {
  const around = `around:${radiusM},${simplifiedLatLonList(coords)}`
  const hit = cache.get(around)
  if (hit) return hit

  const query = `[out:json][timeout:25];
(
  nwr(${around})["amenity"~"^(cafe|restaurant|fast_food|ice_cream|pub|bar)$"]["name"];
  nwr(${around})["shop"="bakery"]["name"];
);
out center tags 300;`

  const pois = (await overpass(query, signal)).flatMap(toPoi)
  cache.set(around, pois)
  return pois
}

/**
 * Run an Overpass QL query. Races the mirrors; the first good answer wins and
 * the others are cancelled.
 */
export async function overpass(query: string, signal?: AbortSignal, timeoutMs = TIMEOUT_MS): Promise<OverpassElement[]> {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await Promise.any(
      ENDPOINTS.map(async (endpoint) => {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ data: query }),
          signal: ctrl.signal,
        })
        // Busy servers answer with HTML error pages; treat anything non-JSON as a miss.
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(`Overpass ${res.status}`)
        const data = (await res.json()) as { elements: OverpassElement[]; remark?: string }
        // A server that ran out of time still answers 200, with a "runtime error" remark
        // and partial (often empty) results. Count that as a miss so another mirror wins.
        if (data.remark && /error|timed? ?out/i.test(data.remark)) throw new Error('Overpass timed out')
        return data.elements
      }),
    )
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw err instanceof AggregateError ? new Error('All Overpass servers are busy') : err
  } finally {
    ctrl.abort() // cancel the slower mirrors
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function toPoi(el: OverpassElement): OsmPoi[] {
  const t = el.tags ?? {}
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (lat === undefined || lng === undefined || !t.name) return []
  const category = t.amenity ?? (t.shop === 'bakery' ? 'bakery' : undefined)
  if (!category) return []
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
  return [
    {
      osmId: `${el.type[0].toUpperCase()}${el.id}`,
      name: t.name,
      lat,
      lng,
      category,
      openingHours: t.opening_hours,
      cuisine: t.cuisine?.split(';')[0].replace(/_/g, ' '),
      address: street || undefined,
    },
  ]
}
