import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { db, type List, type Photo, type Place, type Visit, type Walk } from '../lib/db'
import { levelFor, type Level } from '../lib/levels'

export interface PlaceWithStats extends Place {
  visitCount: number
  lastVisitAt?: number
  level: Level
}

/**
 * All live places with visit stats. Visit counts are derived from the visits
 * table rather than stored, so visits logged on two devices merge cleanly.
 */
export function usePlaces(): PlaceWithStats[] | undefined {
  const places = useLiveQuery(() => db.places.where('deleted').equals(0).toArray(), [])
  const visits = useLiveQuery(() => db.visits.where('deleted').equals(0).toArray(), [])

  return useMemo(() => {
    if (!places || !visits) return undefined
    const stats = new Map<string, { count: number; last: number }>()
    for (const v of visits) {
      const s = stats.get(v.placeId) ?? { count: 0, last: 0 }
      s.count++
      s.last = Math.max(s.last, v.arrivedAt)
      stats.set(v.placeId, s)
    }
    return places.map((p) => {
      const s = stats.get(p.id)
      const visitCount = s?.count ?? 0
      return { ...p, visitCount, lastVisitAt: s?.last, level: levelFor(visitCount) }
    })
  }, [places, visits])
}

export function useVisits(): Visit[] | undefined {
  return useLiveQuery(
    () =>
      db.visits
        .orderBy('arrivedAt')
        .reverse()
        .filter((v) => !v.deleted)
        .toArray(),
    [],
  )
}

export function useLists(): List[] | undefined {
  return useLiveQuery(() => db.lists.where('deleted').equals(0).sortBy('createdAt'), [])
}

export function useWalks(): Walk[] | undefined {
  return useLiveQuery(() => db.walks.where('deleted').equals(0).toArray(), [])
}

/** This visit's photos as object URLs, revoked when they change or unmount. */
export function usePhotoUrls(visitId: string | undefined): { photo: Photo; url: string }[] {
  const photos = useLiveQuery(
    () => (visitId ? db.photos.where('visitId').equals(visitId).sortBy('createdAt') : Promise.resolve([] as Photo[])),
    [visitId],
  )
  const urls = useMemo(() => (photos ?? []).map((photo) => ({ photo, url: URL.createObjectURL(photo.blob) })), [photos])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u.url)), [urls])
  return urls
}
