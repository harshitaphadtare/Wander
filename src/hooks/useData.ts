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

export interface PinPhoto {
  url: string
  count: number
}

/**
 * The newest photo per place (thumbnail), for photo pins on the map. Only
 * thumbnails are turned into URLs, so this stays light with hundreds of photos.
 */
export function usePinPhotos(): Map<string, PinPhoto> {
  const data = useLiveQuery(async () => {
    const [photos, visits] = await Promise.all([db.photos.toArray(), db.visits.where('deleted').equals(0).toArray()])
    const placeOf = new Map(visits.map((v) => [v.id, v.placeId]))
    const byPlace = new Map<string, { photo: Photo; count: number }>()
    for (const p of photos) {
      const placeId = placeOf.get(p.visitId)
      if (!placeId) continue
      const cur = byPlace.get(placeId)
      if (!cur) byPlace.set(placeId, { photo: p, count: 1 })
      else {
        cur.count++
        if (p.createdAt > cur.photo.createdAt) cur.photo = p
      }
    }
    return byPlace
  }, [])
  const pins = useMemo(() => {
    const out = new Map<string, PinPhoto>()
    for (const [placeId, { photo, count }] of data ?? []) out.set(placeId, { url: URL.createObjectURL(photo.thumb ?? photo.blob), count })
    return out
  }, [data])
  useEffect(() => () => pins.forEach((p) => URL.revokeObjectURL(p.url)), [pins])
  return pins
}

export interface PlacePhoto {
  photo: Photo
  url: string
  visitId: string
  /** when you were there */
  at: number
}

/** Every photo from every visit to a place, newest visit first, for the place's carousel. */
export function usePlacePhotos(placeId: string | undefined): PlacePhoto[] {
  const data = useLiveQuery(async () => {
    if (!placeId) return []
    const visits = await db.visits.where('placeId').equals(placeId).filter((v) => !v.deleted).toArray()
    const at = new Map(visits.map((v) => [v.id, v.arrivedAt]))
    const photos = await db.photos.where('visitId').anyOf([...at.keys()]).toArray()
    return photos
      .map((photo) => ({ photo, visitId: photo.visitId, at: at.get(photo.visitId)! }))
      .sort((a, b) => b.at - a.at || a.photo.createdAt - b.photo.createdAt)
  }, [placeId])
  const items = useMemo(() => (data ?? []).map((d) => ({ ...d, url: URL.createObjectURL(d.photo.blob) })), [data])
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), [items])
  return items
}

/** Thumbnail URLs per visit, for the photo strips in the Journal. */
export function useVisitThumbs(visitIds: string[]): Map<string, { id: string; url: string }[]> {
  const key = visitIds.join(',')
  const data = useLiveQuery(
    () => (visitIds.length ? db.photos.where('visitId').anyOf(visitIds).sortBy('createdAt') : Promise.resolve([] as Photo[])),
    // visitIds is captured through `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  const thumbs = useMemo(() => {
    const out = new Map<string, { id: string; url: string }[]>()
    for (const p of data ?? []) {
      const list = out.get(p.visitId) ?? []
      list.push({ id: p.id, url: URL.createObjectURL(p.thumb ?? p.blob) })
      out.set(p.visitId, list)
    }
    return out
  }, [data])
  useEffect(() => () => thumbs.forEach((l) => l.forEach((t) => URL.revokeObjectURL(t.url))), [thumbs])
  return thumbs
}
