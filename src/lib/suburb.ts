import type { LatLng } from './geo'

/**
 * The suburb you're looking at, with its real boundary, from OpenStreetMap's
 * Nominatim (free, no key; fair use is one request a second, which we're far
 * under). Boundaries barely change, so each one is kept on the phone for 90 days.
 */

export interface Suburb {
  name: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  /** [west, south, east, north] */
  bbox: [number, number, number, number]
}

const KEY = 'wander:suburbs'
const TTL_MS = 90 * 24 * 3_600_000
const MAX_CACHED = 30

interface Cached extends Suburb {
  at: number
}

function readCache(): Cached[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Cached[]
  } catch {
    return []
  }
}

function writeCache(list: Cached[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_CACHED)))
  } catch {
    /* storage full: we'll just ask again next time */
  }
}

/** Ray casting; `ring` is [lng, lat][]. */
function inRing(x: number, y: number, ring: number[][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Point-in-polygon for Polygon / MultiPolygon, holes included. */
export function contains(geom: Suburb['geometry'], lng: number, lat: number): boolean {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  return polys.some((rings) => inRing(lng, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lng, lat, hole)))
}

export async function suburbAt(at: LatLng, signal?: AbortSignal): Promise<Suburb | null> {
  const cached = readCache()
  const hit = cached.find((s) => Date.now() - s.at < TTL_MS && contains(s.geometry, at.lng, at.lat))
  if (hit) return hit

  const params = new URLSearchParams({
    format: 'geojson',
    lat: at.lat.toFixed(5),
    lon: at.lng.toFixed(5),
    zoom: '14', // suburb level
    polygon_geojson: '1',
    polygon_threshold: '0.0002', // simplify the outline; plenty for ~100 m hexes
    'accept-language': 'en',
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal })
  if (!res.ok) return null
  const data = (await res.json()) as {
    features?: { geometry: GeoJSON.Geometry; properties: { name?: string }; bbox?: number[] }[]
  }
  const f = data.features?.[0]
  if (!f?.properties.name || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') || f.bbox?.length !== 4) return null

  const suburb: Suburb = { name: f.properties.name, geometry: f.geometry, bbox: f.bbox as Suburb['bbox'] }
  writeCache([...cached.filter((c) => c.name !== suburb.name && Date.now() - c.at < TTL_MS), { ...suburb, at: Date.now() }])
  return suburb
}
