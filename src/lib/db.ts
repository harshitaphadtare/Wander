import Dexie, { type EntityTable } from 'dexie'

/**
 * Every synced row carries:
 *  - id: a UUID, so rows created on different devices never collide
 *  - updatedAt: ms timestamp, used for last-write-wins merges
 *  - deleted: 0 | 1 soft-delete flag (so deletes can sync)
 *  - dirty: 0 | 1, set on local writes, cleared once pushed to the cloud
 * IndexedDB cannot index booleans, hence the 0 | 1 numbers.
 */
interface SyncFields {
  id: string
  updatedAt: number
  deleted: 0 | 1
  dirty: 0 | 1
}

export interface Place extends SyncFields {
  name: string
  lat: number
  lng: number
  /** e.g. "N123456" (OSM node), when the place came from search */
  osmId?: string
  /** OSM tag value, e.g. "cafe", "park", "restaurant" */
  category?: string
  address?: string
  createdAt: number
  /** Your own lists this place belongs to ("Rainy day", "Work cafes"…). */
  listIds?: string[]
}

export type VisitSource = 'check-in' | 'auto'

export interface Visit extends SyncFields {
  placeId: string
  arrivedAt: number
  leftAt?: number
  source: VisitSource
  /** "Got the pistachio croissant". Syncs. */
  note?: string
  /** Photos stay on this device (see `photos`); ids are kept so the journal knows to look. */
  photoIds?: string[]
  /** Steps you walked that day/outing, entered by hand. Syncs. */
  steps?: number
}

export interface List extends SyncFields {
  name: string
  createdAt: number
}

/** A visit photo, resized on the device. Never synced or backed up to the cloud. */
export interface Photo {
  id: string
  visitId: string
  blob: Blob
  /** ~360 px version for map pins and strips (photos added before this existed have none). */
  thumb?: Blob
  width: number
  height: number
  createdAt: number
}

// Tables for later phases (walk planner, AI picks); defined now so the schema is stable.
export interface Walk extends SyncFields {
  from: { lat: number; lng: number; name?: string }
  to: { lat: number; lng: number; name?: string }
  stopPlaceId?: string
  distanceM: number
  durationS?: number
  startedAt: number
  endedAt?: number
  arrived?: boolean
  /** the planned route, simplified ([lng, lat]); clears the fog along the way */
  path?: [number, number][]
}

export interface PickItem {
  name: string
  lat: number
  lng: number
  category?: string
  osmId?: string
  reason: string
  /** e.g. "7 km away" */
  meta?: string
}

/** "Explore next" suggestions, kept for the week / month / year they were made for. */
export interface Pick extends SyncFields {
  period: 'week' | 'month' | 'year'
  /** which week / month / year, e.g. "2026-W41", "2026-10", "2026" */
  key?: string
  items?: PickItem[]
  /** saved places among the picks (from the original data model) */
  placeIds: string[]
  reasons: string[]
  createdAt: number
  /** whether Gemini wrote the reasons */
  ai?: boolean
}

export interface Meta {
  key: string
  value: unknown
}

export const db = new Dexie('wander') as Dexie & {
  places: EntityTable<Place, 'id'>
  visits: EntityTable<Visit, 'id'>
  walks: EntityTable<Walk, 'id'>
  picks: EntityTable<Pick, 'id'>
  lists: EntityTable<List, 'id'>
  photos: EntityTable<Photo, 'id'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  places: 'id, osmId, updatedAt, dirty, deleted',
  visits: 'id, placeId, arrivedAt, updatedAt, dirty, deleted',
  walks: 'id, startedAt, updatedAt, dirty, deleted',
  picks: 'id, period, createdAt, updatedAt, dirty, deleted',
  meta: 'key',
})

// v2: lists, and on-device visit photos.
db.version(2).stores({
  lists: 'id, createdAt, updatedAt, dirty, deleted',
  photos: 'id, visitId, createdAt',
})

/** A row as stored in the cloud / backups: everything but the local-only dirty flag. */
export function withoutDirty<T extends object>(row: T): Omit<T, 'dirty'> {
  const copy = { ...row } as T & { dirty?: unknown }
  delete copy.dirty
  return copy
}

export const SYNCED_TABLES = ['places', 'visits', 'walks', 'picks', 'lists'] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    // Not supported everywhere; harmless to skip.
  }
}
