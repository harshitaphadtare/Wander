import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type Place, type Visit } from '../lib/db'
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
