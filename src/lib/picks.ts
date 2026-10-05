import type { PlaceWithStats } from '../hooks/useData'
import { aiRank } from './ai'
import { notifyLocalChange } from './changes'
import { db, type Pick, type PickItem } from './db'
import { explore, prettyKind, tasteProfile, type TilePois } from './explore'
import { distanceM, formatDistance, type LatLng } from './geo'
import { withTimeout } from './net'
import { nearbyAreas, type PhotonArea } from './photon'
import { weekStart } from './streak'

/**
 * "Explore next": each week three new spots near you, each month a further-out
 * suburb, each year a big day trip. Picks are made once per period and kept
 * (they sync), so they don't change every time you open the app.
 */

export type PickPeriod = Pick['period']

export function periodKey(period: PickPeriod, t = Date.now()): string {
  const d = new Date(t)
  if (period === 'year') return String(d.getFullYear())
  if (period === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return `W${weekStart(t)}`
}

export async function currentPick(period: PickPeriod): Promise<Pick | undefined> {
  const key = periodKey(period)
  return db.picks
    .where('period')
    .equals(period)
    .filter((p) => !p.deleted && p.key === key)
    .last()
}

async function store(period: PickPeriod, items: PickItem[], ai: boolean, places: PlaceWithStats[]): Promise<Pick> {
  const key = periodKey(period)
  // Replace any earlier pick for this period (e.g. after "New picks").
  const old = await db.picks.where('period').equals(period).filter((p) => p.key === key && !p.deleted).toArray()
  const now = Date.now()
  const savedIds = items
    .map((i) => places.find((p) => (i.osmId && p.osmId === i.osmId) || (p.name === i.name && distanceM(p, i) < 40))?.id)
    .filter((id): id is string => !!id)
  const pick: Pick = {
    id: crypto.randomUUID(),
    period,
    key,
    items,
    placeIds: savedIds,
    reasons: items.map((i) => i.reason),
    createdAt: now,
    ai,
    updatedAt: now,
    deleted: 0,
    dirty: 1,
  }
  await db.transaction('rw', db.picks, async () => {
    for (const o of old) await db.picks.update(o.id, { deleted: 1, updatedAt: now, dirty: 1 })
    await db.picks.add(pick)
  })
  notifyLocalChange()
  return pick
}

type Area = PhotonArea

const AREA_CACHE_MS = 30 * 24 * 3_600_000

/** Suburbs / towns around a point. They barely change, so they're kept on the phone for a month per ~5 km cell. */
async function areas(at: LatLng, radiusKm: number, kinds: string[], signal?: AbortSignal): Promise<Area[]> {
  const cell = `${(Math.round(at.lat * 20) / 20).toFixed(2)},${(Math.round(at.lng * 20) / 20).toFixed(2)}`
  const key = `wander:areas:${kinds.join('+')}:${radiusKm}:${cell}`
  try {
    const hit = JSON.parse(localStorage.getItem(key) || 'null') as { at: number; list: Area[] } | null
    if (hit?.list.length && Date.now() - hit.at < AREA_CACHE_MS) return hit.list
  } catch {
    /* ignore a corrupt cache entry */
  }
  const list = await withTimeout(8_000, signal, (s) => nearbyAreas(at, radiusKm, kinds, s))
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify({ at: Date.now(), list }))
  } catch {
    /* storage full: fine, we'll ask again next time */
  }
  return list
}

/** Areas far from anywhere you've checked in, best first. */
function unexplored(list: Area[], places: PlaceWithStats[], at: LatLng, seed: number) {
  const visited = places.filter((p) => p.visitCount > 0)
  return list
    .map((a) => {
      const gap = visited.length ? Math.min(...visited.map((v) => distanceM(v, a))) : 5000
      const jitter = ((Math.abs(Math.sin(seed * 9301 + a.lat * 1e4)) * 1e4) % 1) * 1500
      return { a, d: distanceM(at, a), score: Math.min(gap, 6000) + jitter }
    })
    .sort((x, y) => y.score - x.score)
}

async function aiPickOne(mood: string, list: { id: string; name: string; kind: string; d: number }[], places: PlaceWithStats[], signal?: AbortSignal) {
  // Capped: a slow AI answer falls back to Wander's own choice rather than holding the card up.
  return withTimeout(5_000, signal, (s) =>
    aiRank(
      {
        mood,
        taste: tasteProfile(places),
        count: 1,
        candidates: list.map((c) => ({ id: c.id, name: c.name, category: c.kind, distance: formatDistance(c.d), visits: 0 })),
      },
      s,
    ),
  ).catch((err) => {
    if (signal?.aborted) throw err
    return null
  })
}

export async function makePick(
  period: PickPeriod,
  at: LatLng,
  places: PlaceWithStats[],
  seed = 0,
  signal?: AbortSignal,
  tiles?: TilePois,
): Promise<Pick> {
  if (period === 'week') {
    const r = await explore({ mood: 'new', at, time: 120, reach: 4000, places, seed, useAi: true, signal, tiles })
    const top = r.ai ? r.picks : r.pool.slice(0, 3)
    const items = top.slice(0, 3).map((p) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      category: p.category,
      osmId: p.osmId,
      reason: p.reason,
      meta: p.facts.slice(0, 2).join(' · '),
    }))
    if (!items.length) throw new Error('Couldn’t find new places nearby. Try again in a bit.')
    return store('week', items, r.ai, places)
  }

  const month = period === 'month'
  const list = await areas(at, month ? 14 : 160, month ? ['suburb', 'neighbourhood', 'quarter'] : ['town'], signal)
  const ranked = unexplored(
    list.filter((a) => {
      const d = distanceM(at, a)
      return month ? d > 2500 && d < 14_000 : d > 40_000
    }),
    places,
    at,
    seed + new Date().getMonth(),
  ).slice(0, 12)
  if (!ranked.length) throw new Error(month ? 'No suburbs found nearby.' : 'No towns found within a day trip.')

  const ai = await aiPickOne(
    month ? 'a further-out suburb to explore on foot this month' : 'a big day trip for this year',
    ranked.map((r) => ({ id: r.a.id, name: r.a.name, kind: r.a.kind, d: r.d })),
    places,
    signal,
  )
  const chosen = (ai?.[0] && ranked.find((r) => r.a.id === ai[0].id)) || ranked[0]
  const km = formatDistance(chosen.d)
  const reason =
    ai?.[0]?.reason ??
    (month
      ? `You've never checked in around ${chosen.a.name}. Spend an afternoon wandering it.`
      : `A full day out: ${chosen.a.name} is ${km} away. Pack snacks.`)
  return store(
    period,
    [{ name: chosen.a.name, lat: chosen.a.lat, lng: chosen.a.lng, category: prettyKind(chosen.a.kind), osmId: chosen.a.id, reason, meta: `${km} away` }],
    !!ai?.[0],
    places,
  )
}
