import type { LatLng } from './geo'

/**
 * Photon (komoot) geocoder: free, no key, fair use.
 * https://photon.komoot.io
 */
const BASE = 'https://photon.komoot.io'

export interface PhotonPlace {
  name: string
  lat: number
  lng: number
  osmId?: string
  category?: string
  address?: string
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    name?: string
    osm_id?: number
    osm_type?: 'N' | 'W' | 'R'
    osm_key?: string
    osm_value?: string
    housenumber?: string
    street?: string
    district?: string
    locality?: string
    city?: string
    state?: string
    country?: string
    type?: string
  }
}

function toPlace(f: PhotonFeature): PhotonPlace {
  const p = f.properties
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(' ')
  const area = p.district || p.locality || p.city
  const address = [streetLine, area, p.city !== area ? p.city : undefined].filter(Boolean).join(', ') || p.state || p.country
  return {
    name: p.name || streetLine || area || 'Unnamed spot',
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    osmId: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : undefined,
    category: p.osm_key === 'place' || p.osm_key === 'highway' || p.osm_key === 'building' ? undefined : p.osm_value,
    address: address !== p.name ? address : undefined,
  }
}

export async function searchPlaces(query: string, near?: LatLng, signal?: AbortSignal): Promise<PhotonPlace[]> {
  const params = new URLSearchParams({ q: query, limit: '8', lang: 'en' })
  if (near) {
    // Search only needs a rough area to rank results (~1 km), not your exact position.
    params.set('lat', near.lat.toFixed(2))
    params.set('lon', near.lng.toFixed(2))
  }
  const res = await fetch(`${BASE}/api/?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  // One place is often mapped several times (node, building, site); keep the first per name nearby.
  const kept: PhotonPlace[] = []
  for (const p of data.features.map(toPlace)) {
    const dupe = kept.some(
      (k) => k.name.toLowerCase() === p.name.toLowerCase() && Math.abs(k.lat - p.lat) < 0.003 && Math.abs(k.lng - p.lng) < 0.004,
    )
    if (!dupe) kept.push(p)
  }
  return kept
}

/** Named things near a point, nearest first. */
export async function reverseGeocode(at: LatLng, signal?: AbortSignal): Promise<PhotonPlace[]> {
  const params = new URLSearchParams({
    // ~10 m precision: enough to find what's around you without sending your exact spot.
    lat: at.lat.toFixed(4),
    lon: at.lng.toFixed(4),
    limit: '6',
    radius: '0.15', // km
    lang: 'en',
  })
  const res = await fetch(`${BASE}/reverse?${params}`, { signal })
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  return data.features.map(toPlace)
}

const FOOD = new Set(['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'bakery', 'ice_cream', 'food_court', 'bistro'])
export function isFoodPlace(category?: string) {
  return !!category && FOOD.has(category)
}

export function prettyCategory(category?: string) {
  if (!category) return ''
  const s = category.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface PhotonArea {
  id: string
  name: string
  lat: number
  lng: number
  /** suburb, neighbourhood, town… */
  kind: string
}

/** Named areas (suburbs, towns) around a point, nearest first. Much lighter than an Overpass area query. */
export async function nearbyAreas(at: LatLng, radiusKm: number, kinds: string[], signal?: AbortSignal): Promise<PhotonArea[]> {
  const params = new URLSearchParams({
    lat: at.lat.toFixed(2),
    lon: at.lng.toFixed(2),
    radius: String(radiusKm),
    limit: '50',
    lang: 'en',
  })
  for (const k of kinds) params.append('osm_tag', `place:${k}`)
  const res = await fetch(`${BASE}/reverse?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  return data.features.flatMap((f) =>
    f.properties.name
      ? [
          {
            id: `${f.properties.osm_type ?? 'N'}${f.properties.osm_id ?? f.properties.name}`,
            name: f.properties.name,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            kind: f.properties.osm_value ?? 'area',
          },
        ]
      : [],
  )
}

/** Places with any of `tags` (e.g. "amenity:cafe") within `radiusKm`, nearest first. Fast backup when Overpass is busy. */
export async function nearbyByTags(at: LatLng, radiusKm: number, tags: string[], signal?: AbortSignal): Promise<PhotonPlace[]> {
  const params = new URLSearchParams({
    lat: at.lat.toFixed(4),
    lon: at.lng.toFixed(4),
    radius: String(Math.max(0.3, Math.round(radiusKm * 10) / 10)),
    limit: '50',
    lang: 'en',
  })
  for (const t of tags) params.append('osm_tag', t)
  const res = await fetch(`${BASE}/reverse?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  return data.features.filter((f) => f.properties.name).map(toPlace)
}
