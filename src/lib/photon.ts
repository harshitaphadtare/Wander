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
    params.set('lat', near.lat.toFixed(4))
    params.set('lon', near.lng.toFixed(4))
  }
  const res = await fetch(`${BASE}/api/?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  return data.features.map(toPlace)
}

/**
 * Places of one kind near a point (e.g. cafés), nearest first.
 * `tags` are OSM key:value pairs; Photon ORs multiple osm_tag filters.
 */
export async function searchNearbyCategory(
  q: string,
  tags: string[],
  near: LatLng,
  signal?: AbortSignal,
): Promise<PhotonPlace[]> {
  const params = new URLSearchParams({ q, limit: '20', lang: 'en', lat: near.lat.toFixed(4), lon: near.lng.toFixed(4) })
  for (const t of tags) params.append('osm_tag', t)
  const res = await fetch(`${BASE}/api/?${params}`, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  const dist = (p: PhotonPlace) => Math.hypot(p.lat - near.lat, (p.lng - near.lng) * Math.cos((near.lat * Math.PI) / 180))
  return data.features.map(toPlace).sort((a, b) => dist(a) - dist(b))
}

/** Named things near a point, nearest first. */
export async function reverseGeocode(at: LatLng, signal?: AbortSignal): Promise<PhotonPlace[]> {
  const params = new URLSearchParams({
    lat: at.lat.toFixed(6),
    lon: at.lng.toFixed(6),
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
