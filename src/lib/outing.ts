import type { PlaceWithStats } from '../hooks/useData'
import { explore, openAt, walkMinutes, type ExplorePick, type TilePois, type TimeBudget } from './explore'
import { distanceM, type LatLng } from './geo'
import { walkingRoute, type Route } from './routing'
import { loadOpeningHours, type OpeningHours } from './stops'

/**
 * Outings: "I've got two hours" becomes a short itinerary (a park, then coffee,
 * then a lookout) joined into one walking route, with each stop open when you'd
 * actually get there.
 *
 * Candidates come from Explore's own ranking (real OSM places, new-to-you first),
 * so this only decides which few go together, in what order, within your time.
 */

export type StopRole = 'sight' | 'coffee' | 'food'

export interface OutingStop {
  pick: ExplorePick
  role: StopRole
  arriveAt: Date
  /** minutes spent there */
  stayMin: number
  /** walking minutes from the previous stop (or from you, for the first) */
  walkMin: number
  /** e.g. "Open till 5 pm", evaluated at arrival */
  hours?: string
}

export interface Outing {
  stops: OutingStop[]
  route: Route
  /** start to leaving the last stop */
  totalMin: number
  walkMin: number
  endsAt: Date
}

export class OutingError extends Error {
  readonly kind: 'needs-time' | 'none'
  constructor(kind: 'needs-time' | 'none', message: string) {
    super(message)
    this.kind = kind
  }
}

const STAY: Record<StopRole, number> = { sight: 25, coffee: 20, food: 50 }

/** The shape of the outing: how many stops, and where the treat goes. */
function shapeFor(time: TimeBudget, now: Date): StopRole[] {
  const h = now.getHours() + now.getMinutes() / 60
  const mealtime = (h >= 11.5 && h < 14) || (h >= 17.5 && h < 20.5)
  const treat: StopRole = mealtime ? 'food' : 'coffee'
  if (time <= 60) return ['sight', treat]
  if (time <= 120) return ['sight', treat, 'sight']
  return ['sight', treat, 'sight', 'sight']
}

interface Plan {
  picks: ExplorePick[]
  roles: StopRole[]
  score: number
}

/**
 * Try every ordering of the top candidates that fits the shape, and keep the best
 * one that fits your time. Small lists (≤10 sights, ≤8 treats) keep this to a
 * few thousand cheap checks.
 */
function bestPlan(
  shape: StopRole[],
  sights: ExplorePick[],
  treats: ExplorePick[],
  start: LatLng,
  budgetMin: number,
  OH: OpeningHours | null,
): Plan | null {
  let best: Plan | null = null
  const maxLegMin = budgetMin >= 240 ? 35 : 20
  const now = Date.now()

  const walk = (picks: ExplorePick[], i: number, at: LatLng, clock: number, score: number, walked: number, kinds: Set<string>) => {
    if (i === shape.length) {
      const total = (clock - now) / 60_000
      // Reward variety and using the time you have; walking is the cost.
      const final = score + (kinds.size - 1) * 0.6 - walked * 0.08 + Math.min(total / budgetMin, 1) * 0.8
      if (!best || final > best.score) best = { picks: [...picks], roles: shape, score: final }
      return
    }
    const role = shape[i]
    const list = role === 'sight' ? sights : treats
    for (const c of list) {
      if (picks.some((p) => p.id === c.id)) continue
      const legMin = walkMinutes(distanceM(at, c))
      // An outing is one easy wander, not a slog between far-flung stops.
      if (legMin > maxLegMin) continue
      const arrive = clock + legMin * 60_000
      const stay = STAY[role]
      // Leave room for the remaining stops' stays, at least.
      const restStays = shape.slice(i + 1).reduce((sum, r) => sum + STAY[r], 0)
      if ((arrive - now) / 60_000 + stay + restStays > budgetMin) continue
      const open = openAt(c.openingHours, new Date(arrive), OH)
      if (open.state === 'closed') continue
      // The treat should feel on the way, not a trek between sights.
      if (role !== 'sight' && i > 0 && legMin > 15) continue
      // For the coffee / food stop, one confirmed open beats one whose hours we don't know.
      const doubt = role === 'sight' ? 0 : open.state === 'unknown' ? 1.5 : open.state === 'closing' ? 1 : 0
      picks.push(c)
      walk(picks, i + 1, c, arrive + stay * 60_000, score + c.score - doubt, walked + legMin, new Set(kinds).add(c.category))
      picks.pop()
    }
  }
  walk([], 0, start, now, 0, 0, new Set())
  return best
}

interface Options {
  at: LatLng
  time: TimeBudget
  places: PlaceWithStats[]
  seed?: number
  /** stops already suggested, so Shuffle brings a different outing */
  exclude?: Set<string>
  tiles?: TilePois
  signal?: AbortSignal
}

export async function planOuting(o: Options): Promise<Outing> {
  if (o.time < 60) throw new OutingError('needs-time', 'An outing needs at least an hour.')
  const now = new Date()
  const shape = shapeFor(o.time, now)
  const treatMood = shape.includes('food') ? 'food' : 'coffee'
  // Walkable only: an outing is one walk. Half a day can range a little further.
  const reach = o.time >= 240 ? 4000 : 1500
  const common = { at: o.at, time: o.time, reach, places: o.places, seed: o.seed, exclude: o.exclude, tiles: o.tiles, signal: o.signal } as const

  const [sightsR, treatsR, OH] = await Promise.all([
    explore({ ...common, mood: 'new' }),
    explore({ ...common, mood: treatMood }),
    loadOpeningHours().catch(() => null),
  ])
  // Explore's ranking pushes a wider search towards its outer band, which alone
  // gives far-apart stops that can't be chained. Mix the best-ranked with the
  // nearest, so the planner has both good picks and close-together ones to try.
  const shortlist = (pool: ExplorePick[], n: number) => {
    const walkable = pool.filter((p) => !p.far)
    const near = [...walkable].sort((a, b) => a.distanceM - b.distanceM)
    const seen = new Set<string>()
    return [...walkable.slice(0, n), ...near.slice(0, n)].filter((p) => !seen.has(p.id) && !!seen.add(p.id))
  }
  const sights = shortlist(sightsR.pool, 6)
  const treats = shortlist(treatsR.pool, 5)
  if (!sights.length || !treats.length) throw new OutingError('none', 'Nothing fits an outing from here right now.')

  // Fall back to fewer stops before giving up entirely.
  let plan: Plan | null = null
  for (let n = shape.length; n >= 2 && !plan; n--) plan = bestPlan(shape.slice(0, n), sights, treats, o.at, o.time, OH)
  if (!plan) throw new OutingError('none', 'Nothing fits an outing from here right now.')
  const chosen: Plan = plan

  // One real walking route through every stop; its time is shared out across the legs.
  const route = await walkingRoute([o.at, ...chosen.picks], o.signal)
  const legsM = chosen.picks.map((p, i) => distanceM(i === 0 ? o.at : chosen.picks[i - 1], p))
  const straight = legsM.reduce((a, b) => a + b, 0) || 1
  let clock = now.getTime()
  let walked = 0
  const stops = chosen.picks.map((pick, i): OutingStop => {
    const walkMin = Math.max(1, Math.round(((legsM[i] / straight) * route.durationS) / 60))
    walked += walkMin
    clock += walkMin * 60_000
    const arriveAt = new Date(clock)
    const role = chosen.roles[i]
    clock += STAY[role] * 60_000
    return { pick, role, arriveAt, stayMin: STAY[role], walkMin, hours: openAt(pick.openingHours, arriveAt, OH).text }
  })
  return { stops, route, totalMin: Math.round((clock - now.getTime()) / 60_000), walkMin: walked, endsAt: new Date(clock) }
}

/** Google Maps walking directions through every stop (Apple Maps links can't do multi-stop). */
export function outingMapsUrl(from: LatLng, stops: LatLng[]) {
  const ll = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
  const params = new URLSearchParams({ api: '1', origin: ll(from), destination: ll(stops[stops.length - 1]), travelmode: 'walking' })
  if (stops.length > 1) params.set('waypoints', stops.slice(0, -1).map(ll).join('|'))
  return `https://www.google.com/maps/dir/?${params}`
}
