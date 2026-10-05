import type { PlaceWithStats } from '../hooks/useData'
import { aiRank } from './ai'
import { timeOfDay } from './format'
import { distanceM, formatDistance, type LatLng } from './geo'
import { overpass, type OverpassElement } from './overpass'
import { nearbyByTags } from './photon'
import { loopRoute, type Route } from './routing'
import { loadOpeningHours, type OpeningHours } from './stops'
import { nextSunset } from './sun'
import { hourlyForecast, SKY_LABEL, type WeatherHour } from './weather'

/**
 * "What do you feel like?" Real OpenStreetMap places, ranked on the phone by
 * what's new to you, what's open when you'd arrive, distance, the weather and
 * time to sunset. Gemini (when the Worker has a key) only re-ranks and writes
 * the reasons; it never adds places, so it can't invent a café.
 *
 * OSM has no ratings or photos, so "new" means new to you, not highly rated.
 */

export type Mood = 'stroll' | 'new' | 'hike' | 'food' | 'coffee' | 'sunset' | 'surprise'
/** minutes you've got */
export type TimeBudget = 30 | 60 | 120 | 240
/** how far you'll go, metres */
export type Reach = 1500 | 4000 | 10000 | 30000

export const TIME_OPTIONS: readonly (readonly [TimeBudget, string])[] = [
  [30, '30 min'],
  [60, '1 h'],
  [120, '2 h'],
  [240, 'Half a day'],
]
export const REACH_OPTIONS: readonly (readonly [Reach, string])[] = [
  [1500, 'Walkable'],
  [4000, '4 km'],
  [10000, '10 km'],
  [30000, 'Anywhere'],
]

const WALK_MPS = 1.33 // ~4.8 km/h
const STREET_FACTOR = 1.3 // streets are longer than a straight line
const walkMinutes = (m: number) => Math.round((m * STREET_FACTOR) / WALK_MPS / 60)
/** Beyond this you'd take a tram or drive, so cards offer directions instead of "Walk there". */
export const WALKABLE_M = 3500

export interface Candidate {
  id: string
  osmId: string
  name: string
  lat: number
  lng: number
  category: string
  openingHours?: string
  cuisine?: string
  address?: string
}

export interface ExplorePick extends Candidate {
  distanceM: number
  visits: number
  savedPlaceId?: string
  wishlist: boolean
  far: boolean
  /** short facts for chips, e.g. ["Never been", "14 min walk", "Open till 9"] */
  facts: string[]
  reason: string
  score: number
}

export interface ExploreContext {
  weather?: string
  rainy: boolean
  sunset?: Date
}

export interface ExploreResult {
  picks: ExplorePick[]
  /** everything that qualified, best first; Shuffle draws from here */
  pool: ExplorePick[]
  context: ExploreContext
  loop?: Route
  /** where the AI wrote the reasons */
  ai: boolean
}

// ---------------------------------------------------------------- queries ----

const MOOD_TAGS: Record<Exclude<Mood, 'stroll' | 'surprise'>, string[]> = {
  new: [
    '["tourism"~"^(viewpoint|museum|gallery|attraction)$"]',
    '["leisure"~"^(park|garden)$"]',
    '["amenity"~"^(marketplace|arts_centre|library)$"]',
    '["historic"~"^(castle|monument|ruins)$"]',
    '["man_made"~"^(lighthouse|pier)$"]',
  ],
  hike: ['["leisure"="nature_reserve"]', '["boundary"="national_park"]', '["natural"="peak"]', '["tourism"="viewpoint"]'],
  food: ['["amenity"~"^(restaurant|fast_food|cafe|ice_cream)$"]', '["shop"="bakery"]'],
  coffee: ['["amenity"="cafe"]'],
  sunset: ['["tourism"="viewpoint"]', '["natural"~"^(beach|peak)$"]', '["man_made"="pier"]'],
}

/** The same moods as Photon tags, for the fast fallback (no hours or cuisine, but quick). */
const PHOTON_TAGS: Record<Exclude<Mood, 'stroll' | 'surprise'>, string[]> = {
  new: ['tourism:viewpoint', 'tourism:museum', 'tourism:gallery', 'tourism:attraction', 'leisure:park', 'leisure:garden', 'amenity:marketplace', 'amenity:arts_centre'],
  hike: ['leisure:nature_reserve', 'boundary:national_park', 'natural:peak', 'tourism:viewpoint'],
  food: ['amenity:restaurant', 'amenity:fast_food', 'amenity:cafe', 'amenity:ice_cream', 'shop:bakery'],
  coffee: ['amenity:cafe'],
  sunset: ['tourism:viewpoint', 'natural:beach', 'man_made:pier'],
}

const INDOOR = new Set(['museum', 'gallery', 'arts_centre', 'library', 'marketplace', 'cafe', 'restaurant', 'fast_food', 'bakery', 'ice_cream'])
const OUTDOOR = new Set(['park', 'garden', 'viewpoint', 'beach', 'peak', 'nature_reserve', 'national_park', 'pier', 'lighthouse'])

function categoryOf(t: Record<string, string>): string | undefined {
  if (t.boundary === 'national_park') return 'national_park'
  return t.amenity ?? t.tourism ?? t.leisure ?? t.natural ?? t.historic ?? t.man_made ?? (t.shop === 'bakery' ? 'bakery' : t.shop)
}

function toCandidate(el: OverpassElement): Candidate | null {
  const t = el.tags ?? {}
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  const category = categoryOf(t)
  if (lat === undefined || lng === undefined || !t.name || !category) return null
  const osmId = `${el.type[0].toUpperCase()}${el.id}`
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ')
  return {
    id: osmId,
    osmId,
    name: t['name:en'] || t.name,
    lat,
    lng,
    category,
    openingHours: t.opening_hours,
    cuisine: t.cuisine?.split(';')[0].replace(/_/g, ' '),
    address: [street, t['addr:suburb']].filter(Boolean).join(', ') || undefined,
  }
}

const cache = new Map<string, { at: number; list: Candidate[] }>()
const CACHE_MS = 10 * 60_000

async function candidates(
  tags: string[],
  photonTags: string[],
  at: LatLng,
  radiusM: number,
  signal?: AbortSignal,
): Promise<Candidate[]> {
  // ~100 m grid for the cache key; OSM doesn't need your exact position.
  const key = `${tags.join('|')}@${at.lat.toFixed(3)},${at.lng.toFixed(3)}/${radiusM}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list

  const fromOverpass = async () => {
    const around = `around:${radiusM},${at.lat.toFixed(4)},${at.lng.toFixed(4)}`
    const query = `[out:json][timeout:25];(${tags.map((t) => `nwr(${around})${t}["name"];`).join('')});out center tags 250;`
    const elements = await overpass(query, signal).catch((err) => {
      if (signal?.aborted) throw err
      return overpass(query, signal, 30_000) // the free servers are often busy: one patient retry
    })
    return elements.map(toCandidate).filter((c): c is Candidate => !!c)
  }
  const fromPhoton = async () => {
    const found = await nearbyByTags(at, radiusM / 1000, photonTags, signal)
    const list = found.map(
      (p): Candidate => ({
        id: p.osmId ?? `${p.name}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`,
        osmId: p.osmId ?? '',
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        category: p.category ?? 'attraction',
        address: p.address,
      }),
    )
    if (!list.length) throw new Error('Nothing found nearby')
    return list
  }

  // Overpass has opening hours and cuisine, so it goes first. If it hasn't
  // answered in 3.5 s (or fails), Photon races it: whichever lands first wins,
  // so Explore never sits on a spinner just because a free server is busy.
  const overpassTry = fromOverpass()
  const photonTry = new Promise<Candidate[]>((resolve, reject) => {
    const timer = setTimeout(() => fromPhoton().then(resolve, reject), 3_500)
    overpassTry.then(
      () => clearTimeout(timer), // Overpass won: no need to ask Photon
      () => {
        clearTimeout(timer)
        fromPhoton().then(resolve, reject)
      },
    )
    signal?.addEventListener('abort', () => clearTimeout(timer))
  })
  let found: Candidate[]
  try {
    photonTry.catch(() => {}) // a late loser's failure is fine
    found = await Promise.any([overpassTry, photonTry])
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw err instanceof AggregateError ? new Error('All Overpass servers are busy') : err
  }

  const seen = new Set<string>()
  const list = found.filter((c) => {
    // The same park is often mapped as a node and an area; keep one.
    const k = `${c.name.toLowerCase()}|${c.lat.toFixed(3)}|${c.lng.toFixed(3)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  cache.set(key, { at: Date.now(), list })
  return list
}

// ---------------------------------------------------------------- context ----

async function context(at: LatLng, signal?: AbortSignal): Promise<{ ctx: ExploreContext; hours: WeatherHour[] }> {
  const sunset = nextSunset(at) ?? undefined
  try {
    const hours = await hourlyForecast(at, signal)
    const now = Date.now()
    const next = hours.filter((h) => h.t + 3_600_000 > now).slice(0, 3)
    if (!next.length) return { ctx: { rainy: false, sunset }, hours }
    const wet = next.some((h) => h.sky === 'rain' || h.sky === 'storm' || h.sky === 'drizzle' || h.rainPct >= 50)
    const h = next[0]
    const weather = `${SKY_LABEL[h.sky].toLowerCase()}, ${Math.round(h.tempC)}°`
    return { ctx: { rainy: wet, sunset, weather }, hours }
  } catch {
    return { ctx: { rainy: false, sunset }, hours: [] }
  }
}

// ---------------------------------------------------------------- scoring ----

type OpenState = { state: 'open' | 'closing' | 'closed' | 'unknown'; text?: string }

function openAt(value: string | undefined, at: Date, OH: OpeningHours | null): OpenState {
  if (!value || !OH) return { state: 'unknown' }
  try {
    const oh = new OH(value, null)
    if (oh.getUnknown(at)) return { state: 'unknown' }
    const next = oh.getNextChange(at, new Date(at.getTime() + 86_400_000))
    if (oh.getState(at)) {
      if (next && next.getTime() - at.getTime() < 45 * 60_000) return { state: 'closing', text: `Closes ${timeOfDay(next.getTime())}` }
      return { state: 'open', text: next ? `Open till ${timeOfDay(next.getTime())}` : 'Open' }
    }
    return { state: 'closed', text: next ? `Opens ${timeOfDay(next.getTime())}` : 'Closed' }
  } catch {
    return { state: 'unknown' }
  }
}

/** Deterministic 0–1 jitter so Shuffle reorders near-ties without being random every render. */
function jitter(id: string, seed: number) {
  let h = seed * 2654435761
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2246822519)
  return ((h >>> 0) % 1000) / 1000
}

const PRETTY: Record<string, string> = {
  fast_food: 'takeaway',
  ice_cream: 'ice cream',
  arts_centre: 'arts centre',
  nature_reserve: 'nature reserve',
  national_park: 'national park',
  marketplace: 'market',
}
export const prettyKind = (c: string) => PRETTY[c] ?? c.replace(/_/g, ' ')

const NEW_LINES: Record<string, string> = {
  park: "Green space you haven't wandered yet.",
  garden: "A garden you haven't seen yet.",
  viewpoint: "A view you haven't taken in yet.",
  museum: "A museum you've never stepped into.",
  gallery: "A gallery you've never been inside.",
  marketplace: "A market you haven't browsed yet.",
  library: "A quiet library you've never tried.",
  arts_centre: "An arts centre you haven't checked out.",
  attraction: 'Something locals point visitors to. You haven’t been.',
  monument: "A landmark you've walked past, maybe, but never visited.",
  pier: 'A pier to wander out on, new to you.',
  lighthouse: 'A lighthouse you haven’t been to yet.',
}

function fallbackReason(mood: Mood, p: Omit<ExplorePick, 'reason' | 'score'>, ctx: ExploreContext, rarity: number): string {
  const cuisine = p.cuisine && (p.category === 'restaurant' || p.category === 'fast_food') ? p.cuisine.replace(/(^|\s)\w/g, (c) => c.toUpperCase()) : null
  const kind = cuisine ? `${cuisine} place` : prettyKind(p.category)
  const a = /^[aeiou]/i.test(kind) ? 'An' : 'A'
  if (p.wishlist) return `It's been on your wishlist. Today's a good day for it.`
  switch (mood) {
    case 'coffee':
      return p.visits ? `An old favourite, ${p.far ? 'a short trip' : 'close by'}.` : `A café you haven't tried yet, close by.`
    case 'food':
      return `${a} ${kind} you've never eaten at.`
    case 'sunset':
      return ctx.sunset ? `Get there before the sun goes down at ${timeOfDay(ctx.sunset.getTime())}.` : `A good place to watch the light change.`
    case 'hike':
      return `${a} ${kind} for a proper day outside.`
    default:
      if (ctx.rainy && INDOOR.has(p.category)) return `${a} ${kind} to duck into while it's wet out.`
      if (rarity > 1.2) return `${a} ${kind} in a part of town you rarely go.`
      return NEW_LINES[p.category] ?? `${a} ${kind} you've never been to.`
  }
}

interface Options {
  mood: Mood
  at: LatLng
  time: TimeBudget
  reach: Reach
  places: PlaceWithStats[]
  seed?: number
  /** ids already shown, so Shuffle brings fresh ones */
  exclude?: Set<string>
  /** let Gemini rank and explain (when available) */
  useAi?: boolean
  signal?: AbortSignal
}

const STROLL_M: Record<TimeBudget, number> = { 30: 2200, 60: 4400, 120: 8000, 240: 12000 }

export async function explore(o: Options): Promise<ExploreResult> {
  const seed = o.seed ?? 0
  const [{ ctx }, OH] = await Promise.all([context(o.at, o.signal), loadOpeningHours().catch(() => null)])

  if (o.mood === 'stroll') {
    const loop = await loopRoute(o.at, STROLL_M[o.time], seed, o.signal)
    return { picks: [], pool: [], context: ctx, loop, ai: false }
  }

  const mood = o.mood
  const moods: (keyof typeof MOOD_TAGS)[] = mood === 'surprise' ? ['new', 'food'] : [mood]
  const radius = mood === 'hike' ? Math.min(40_000, Math.max(8_000, o.reach * 2.5)) : o.reach
  const tags = moods.flatMap((m) => MOOD_TAGS[m])
  const found = await candidates(tags, moods.flatMap((m) => PHOTON_TAGS[m]), o.at, radius, o.signal)

  // Match OSM results to your saved places (same feature, or same name within 40 m).
  const byOsm = new Map(o.places.filter((p) => p.osmId).map((p) => [p.osmId!, p]))
  const savedNear = (c: Candidate) =>
    byOsm.get(c.osmId) ?? o.places.find((p) => p.name.toLowerCase() === c.name.toLowerCase() && distanceM(p, c) < 40)
  const visited = o.places.filter((p) => p.visitCount > 0)

  const now = Date.now()
  const pool: ExplorePick[] = []
  for (const c of found) {
    if (o.exclude?.has(c.id)) continue
    const saved = savedNear(c)
    const visits = saved?.visitCount ?? 0
    const d = distanceM(o.at, c)
    if (d > radius * 1.15) continue
    const far = d > WALKABLE_M
    const mins = walkMinutes(d)

    // "New" moods are about places you've never been.
    if (visits > 0 && mood !== 'coffee') continue
    // Walkable picks must fit the time you've got (there and a bit of a stay).
    if (!far && mood !== 'hike' && mins > o.time * 0.6) continue

    const arrive = new Date(now + (far ? 0 : mins) * 60_000)
    const open = openAt(c.openingHours, arrive, OH)
    const needsOpen = mood === 'food' || mood === 'coffee' || INDOOR.has(c.category)
    if (needsOpen && open.state === 'closed') continue

    if (mood === 'sunset' && ctx.sunset) {
      if (far || arrive.getTime() > ctx.sunset.getTime() - 5 * 60_000) continue
    }

    // How far is this from anywhere you've been? Favours the gaps in your map.
    const rarity = visited.length ? Math.min(2, Math.min(...visited.map((v) => distanceM(v, c))) / 1000) : 1

    let score = 0
    score += visits === 0 ? 3 : -Math.min(visits, 5) * 0.4 + (mood === 'coffee' ? 2 : 0)
    score -= (d / radius) * (mood === 'coffee' ? 4 : 2)
    if (mood === 'new' || mood === 'surprise') score += rarity
    if (ctx.rainy) score += INDOOR.has(c.category) ? 2 : OUTDOOR.has(c.category) ? -2 : 0
    else if (OUTDOOR.has(c.category)) score += 0.5
    if (open.state === 'open') score += 0.5
    if (open.state === 'closing') score -= 1
    const wishlist = !!saved && visits === 0
    if (wishlist) score += 1.5
    score += jitter(c.id, seed) * 0.8

    const facts = [
      visits === 0 ? (wishlist ? 'On your wishlist' : 'Never been') : `Been ${visits}×`,
      far ? `${formatDistance(d)} away` : `${Math.max(1, mins)} min walk`,
      open.text ?? (needsOpen ? 'Hours not listed' : undefined),
      ctx.weather && !far ? ctx.weather[0].toUpperCase() + ctx.weather.slice(1) : undefined,
    ].filter((f): f is string => !!f)

    const base = { ...c, distanceM: d, visits, savedPlaceId: saved?.id, wishlist, far, facts }
    pool.push({ ...base, score, reason: fallbackReason(mood, base, ctx, rarity) })
  }

  pool.sort((a, b) => b.score - a.score)
  const count = mood === 'surprise' ? 1 : 4
  let picks = pool.slice(0, count)
  let ai = false

  if (o.useAi && pool.length > 1) {
    const top = pool.slice(0, 15)
    const taste = tasteProfile(o.places)
    const ranked = await aiRank(
      {
        mood,
        weather: ctx.weather,
        taste,
        count,
        candidates: top.map((p) => ({
          id: p.id,
          name: p.name,
          category: prettyKind(p.category) + (p.cuisine ? ` (${p.cuisine})` : ''),
          distance: formatDistance(p.distanceM),
          visits: p.visits,
          open: p.facts.find((f) => /^(Open|Closes|Opens)/.test(f)),
        })),
      },
      o.signal,
    )
    if (ranked?.length) {
      const byId = new Map(top.map((p) => [p.id, p]))
      picks = ranked.slice(0, count).map((r) => ({ ...byId.get(r.id)!, reason: r.reason }))
      ai = true
    }
  }
  return { picks, pool, context: ctx, ai }
}

/** Your most-visited kinds of place, for the AI's sense of your taste. */
export function tasteProfile(places: PlaceWithStats[]): string[] {
  const counts = new Map<string, number>()
  for (const p of places) if (p.category && p.visitCount) counts.set(p.category, (counts.get(p.category) ?? 0) + p.visitCount)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, n]) => `${prettyKind(c)} ×${n}`)
}

/** Apple Maps on iPhone, Google Maps elsewhere. */
export function directionsUrl(to: LatLng, name: string) {
  const isApple = /iPhone|iPad|Macintosh/.test(navigator.userAgent)
  return isApple
    ? `https://maps.apple.com/?daddr=${to.lat},${to.lng}&q=${encodeURIComponent(name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`
}
