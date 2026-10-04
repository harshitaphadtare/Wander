import { notifyLocalChange } from './changes'
import { db, type Place, type Visit, type VisitSource, type Walk } from './db'
import { distanceM, type LatLng } from './geo'

export interface PlaceInput {
  name: string
  lat: number
  lng: number
  osmId?: string
  category?: string
  address?: string
}

const stamp = () => ({ updatedAt: Date.now(), dirty: 1 as const })

/** Radius within which a check-in counts as "the same place". */
export const SAME_PLACE_RADIUS_M = 75

export async function findNearbyPlaces(at: LatLng, radiusM: number) {
  const all = await db.places.where('deleted').equals(0).toArray()
  return all
    .map((place) => ({ place, distance: distanceM(at, place) }))
    .filter((p) => p.distance <= radiusM)
    .sort((a, b) => a.distance - b.distance)
}

/** Save a place, reusing an existing one if it's the same OSM feature or a same-named spot within 30 m. */
export async function savePlace(input: PlaceInput): Promise<Place> {
  return db.transaction('rw', db.places, async () => {
    let existing: Place | undefined
    if (input.osmId) existing = await db.places.where('osmId').equals(input.osmId).first()
    if (!existing) {
      const name = input.name.trim().toLowerCase()
      const nearby = await findNearbyPlaces(input, 30)
      existing = nearby.find((n) => n.place.name.trim().toLowerCase() === name)?.place
    }
    if (existing) {
      if (existing.deleted) {
        await db.places.update(existing.id, { deleted: 0, ...stamp() })
        notifyLocalChange()
      }
      return { ...existing, deleted: 0 }
    }
    const now = Date.now()
    const place: Place = {
      id: crypto.randomUUID(),
      name: input.name.trim() || 'Unnamed spot',
      lat: input.lat,
      lng: input.lng,
      osmId: input.osmId,
      category: input.category,
      address: input.address,
      createdAt: now,
      deleted: 0,
      ...stamp(),
    }
    await db.places.add(place)
    notifyLocalChange()
    return place
  })
}

export async function logVisit(placeId: string, source: VisitSource, arrivedAt = Date.now()): Promise<Visit> {
  const visit: Visit = { id: crypto.randomUUID(), placeId, arrivedAt, source, deleted: 0, ...stamp() }
  await db.visits.add(visit)
  notifyLocalChange()
  return visit
}

export async function endVisit(visitId: string, leftAt = Date.now()) {
  await db.visits.update(visitId, { leftAt, ...stamp() })
  notifyLocalChange()
}

export async function lastVisitTo(placeId: string): Promise<Visit | undefined> {
  const visits = await db.visits.where('placeId').equals(placeId).filter((v) => !v.deleted).sortBy('arrivedAt')
  return visits.at(-1)
}

export async function countVisits(placeId: string): Promise<number> {
  return db.visits.where('placeId').equals(placeId).filter((v) => !v.deleted).count()
}

export async function renamePlace(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.places.update(id, { name: trimmed, ...stamp() })
  notifyLocalChange()
}

/** Soft-delete a place and all its visits. */
export async function deletePlace(id: string) {
  await db.transaction('rw', db.places, db.visits, async () => {
    await db.places.update(id, { deleted: 1, ...stamp() })
    await db.visits.where('placeId').equals(id).modify({ deleted: 1, ...stamp() })
  })
  notifyLocalChange()
}

export async function deleteVisit(id: string) {
  await db.visits.update(id, { deleted: 1, ...stamp() })
  notifyLocalChange()
}

export async function startWalk(walk: Omit<Walk, 'id' | 'updatedAt' | 'dirty' | 'deleted'>): Promise<Walk> {
  const row: Walk = { ...walk, id: crypto.randomUUID(), deleted: 0, ...stamp() }
  await db.walks.add(row)
  notifyLocalChange()
  return row
}

export async function finishWalk(id: string, arrived: boolean) {
  await db.walks.update(id, { endedAt: Date.now(), arrived, ...stamp() })
  notifyLocalChange()
}
