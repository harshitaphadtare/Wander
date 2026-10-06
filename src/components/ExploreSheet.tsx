import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  CloudOff,
  CloudRain,
  CloudSun,
  Coffee,
  Compass,
  Footprints,
  MapPin,
  Mountain,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Shuffle,
  Sparkles,
  Sunset,
  Trees,
  UtensilsCrossed,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import { aiAvailable } from '../lib/ai'
import type { Pick, PickItem } from '../lib/db'
import {
  aiPicks,
  directionsUrl,
  explore,
  prettyKind,
  REACH_OPTIONS,
  TIME_OPTIONS,
  type ExplorePick,
  type ExploreResult,
  type Mood,
  type Reach,
  type TilePois,
  type TimeBudget,
} from '../lib/explore'
import { duration, timeOfDay } from '../lib/format'
import type { LatLng } from '../lib/geo'
import { isAbort } from '../lib/net'
import { OutingError, outingMapsUrl, planOuting, type Outing } from '../lib/outing'
import { currentPick, makePick, type PickPeriod } from '../lib/picks'
import { nextSunset } from '../lib/sun'
import type { Route } from '../lib/routing'
import { IconTile } from '../ui/bits'
import { categoryIcon } from '../ui/icons'
import Sheet from '../ui/Sheet'

/** Explore's moods, plus Outing (several stops joined into one walk; see lib/outing.ts). */
type ViewMood = Mood | 'outing'

const MOODS: { key: ViewMood; label: string; blurb: string; icon: LucideIcon; color: string }[] = [
  { key: 'outing', label: 'Plan an outing', blurb: 'A few stops, one walk, timed to fit', icon: RouteIcon, color: '#0E9F8E' },
  { key: 'stroll', label: 'Stroll', blurb: 'A loop from here', icon: Footprints, color: '#12A187' },
  { key: 'new', label: 'Somewhere new', blurb: 'Parks, galleries, views', icon: Compass, color: '#2F7BF6' },
  { key: 'food', label: 'Food & coffee', blurb: 'Somewhere new to eat or drink', icon: UtensilsCrossed, color: '#E8457A' },
  { key: 'coffee', label: 'Coffee break', blurb: 'Open now, close by', icon: Coffee, color: '#B5651D' },
  { key: 'sunset', label: 'Sunset spot', blurb: 'Before the light goes', icon: Sunset, color: '#F2542D' },
  { key: 'hike', label: 'Hike', blurb: 'Trails and lookouts', icon: Mountain, color: '#5B7F3A' },
  { key: 'surprise', label: 'Surprise me', blurb: 'One confident pick', icon: Wand2, color: '#7357F6' },
]
const MOOD_BY_KEY = Object.fromEntries(MOODS.map((m) => [m.key, m])) as Record<ViewMood, (typeof MOODS)[number]>

/** Just four choices on the first screen; the rest live inside them (see VARIANTS). */
const TILES: ViewMood[] = ['outing', 'new', 'food', 'surprise']

/**
 * Close relatives of a mood, offered as chips once you're in it, instead of
 * as more tiles up front: a stroll is an outing without stops; sunset spots and
 * hikes are kinds of "somewhere new".
 */
const VARIANTS: { group: ViewMood; options: (readonly [ViewMood, string])[] }[] = [
  { group: 'outing', options: [['outing', 'With stops'], ['stroll', 'Just a walk']] },
  { group: 'new', options: [['new', 'Anything'], ['sunset', 'Sunset spot'], ['hike', 'Nature & hikes']] },
]
const variantsFor = (m: ViewMood) => VARIANTS.find((v) => v.options.some(([k]) => k === m))

/** One suggestion that fits the moment, so the first tap is usually the right one. */
function rightNow(at: LatLng, now = new Date()): { mood: ViewMood; time?: TimeBudget; title: string; text: string } {
  const h = now.getHours() + now.getMinutes() / 60
  const sunset = nextSunset(at, now)
  const toSunset = sunset ? (sunset.getTime() - now.getTime()) / 60_000 : null
  if (toSunset !== null && toSunset > 25 && toSunset < 120)
    return { mood: 'sunset', title: 'Golden hour soon', text: `Sunset is at ${timeOfDay(sunset!.getTime())}. Find a spot to watch it.` }
  if (h >= 6 && h < 11) return { mood: 'coffee', title: 'Morning coffee', text: 'A café close by that’s open now.' }
  if ((h >= 11.5 && h < 14) || (h >= 17.5 && h < 20.5)) return { mood: 'food', title: 'Hungry?', text: 'Somewhere new to eat, nearby.' }
  const weekend = now.getDay() === 0 || now.getDay() === 6
  if (h >= 9 && h < 17.5)
    return weekend
      ? { mood: 'outing', time: 120, title: 'Free afternoon?', text: 'A two-hour outing: a few stops, one walk.' }
      : { mood: 'outing', time: 60, title: 'Got an hour?', text: 'A short outing: somewhere new and a coffee.' }
  return { mood: 'stroll', time: 30, title: 'Evening stroll', text: 'A short loop from where you are.' }
}

/** What the status line says while a mood is loading. */
const SEARCHING: Record<ViewMood, string> = {
  outing: 'Planning an outing',
  stroll: 'Drawing a loop from here',
  new: 'Looking for somewhere new',
  food: 'Finding places you haven’t eaten',
  coffee: 'Finding cafés near you',
  sunset: 'Finding a spot for the sunset',
  hike: 'Finding trails and lookouts',
  surprise: 'Picking somewhere for you',
}

export interface ExploreShow {
  picks: { id: string; name: string; lat: number; lng: number; category: string }[]
  loop: Route | null
}

interface Props {
  at: LatLng | null
  /** true when `at` is the map centre because there's no location fix */
  approximate: boolean
  places: PlaceWithStats[]
  /** POIs from the loaded map tiles: Explore's instant fallback when the network is slow */
  tiles?: TilePois
  onShow(show: ExploreShow): void
  /** Minimised: the parent re-frames the map with less room taken by the sheet. */
  onCollapse?(collapsed: boolean): void
  onFocus(at: LatLng): void
  onWalk(pick: { name: string; lat: number; lng: number; osmId?: string; category?: string; placeId?: string }): void
  onSave(pick: { name: string; lat: number; lng: number; osmId?: string; category?: string; address?: string }): Promise<void>
  /** Start walking a stroll loop. */
  onStartLoop(loop: Route): void
  onClose(): void
}

type Stage = { kind: 'moods' } | { kind: 'results'; mood: ViewMood }

export default function ExploreSheet({ at, approximate, places, tiles, onShow, onCollapse, onFocus, onWalk, onSave, onStartLoop, onClose }: Props) {
  const [collapsed, setCollapsedState] = useState(false)
  const setCollapsed = (c: boolean) => {
    setCollapsedState(c)
    onCollapse?.(c)
  }
  const [stage, setStage] = useState<Stage>({ kind: 'moods' })
  const [time, setTime] = useState<TimeBudget>(60)
  const [reach, setReach] = useState<Reach>(1500)
  const [result, setResult] = useState<ExploreResult | null>(null)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [slow, setSlow] = useState(false)
  const [seed, setSeed] = useState(0)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const shown = useRef(new Set<string>())
  const ctrl = useRef<AbortController | null>(null)
  /** New food: everything found on the last fresh search, for the cuisine chips. */
  const [basePool, setBasePool] = useState<ExplorePick[]>([])
  const [cuisine, setCuisine] = useState<string | null>(null)
  const [cuisinePage, setCuisinePage] = useState(0)

  const mood = stage.kind === 'results' ? stage.mood : null

  const run = useCallback(
    async (m: ViewMood, s: number, fresh: boolean): Promise<void> => {
      if (!at) return
      ctrl.current?.abort()
      const c = new AbortController()
      ctrl.current = c
      if (fresh) {
        shown.current = new Set()
        setCuisine(null)
        setCuisinePage(0)
      }
      setLoading(true)
      setSlow(false)
      setError(null)
      const slowTimer = setTimeout(() => !c.signal.aborted && setSlow(true), 3_500)
      try {
        if (m === 'outing') {
          const o = await planOuting({ at, time, places, seed: s, exclude: shown.current, tiles, signal: c.signal })
          if (c.signal.aborted) return
          o.stops.forEach((st) => shown.current.add(st.pick.id))
          setResult(null)
          setOuting(o)
          setLoading(false)
          onShow({ picks: o.stops.map((st) => st.pick), loop: o.route })
          return
        }
        setOuting(null)
        const r = await explore({ mood: m, at, time, reach, places, seed: s, exclude: shown.current, tiles, signal: c.signal })
        if (c.signal.aborted) return
        // Shuffle: when the pool runs dry, start over rather than showing nothing.
        if (!r.picks.length && !r.loop && shown.current.size) {
          shown.current = new Set()
          return run(m, s + 1, false)
        }
        r.picks.forEach((p) => shown.current.add(p.id))
        if (fresh) setBasePool(r.pool)
        setResult(r)
        setLoading(false)
        onShow({ picks: r.picks, loop: r.loop ?? null })

        // Wander's own picks are already on screen; AI only swaps in better ones if it's quick.
        if (aiAvailable && !r.loop) {
          const ranked = await aiPicks(r, m, places, c.signal)
          if (ranked && !c.signal.aborted) {
            ranked.forEach((p) => shown.current.add(p.id))
            setResult({ ...r, picks: ranked, ai: true })
            onShow({ picks: ranked, loop: null })
          }
        }
      } catch (err) {
        if (isAbort(err) || c.signal.aborted) return
        const msg = (err as Error).message || ''
        // Shuffled through everything: start the outing ideas over rather than giving up.
        if (err instanceof OutingError && err.kind === 'none' && shown.current.size && !fresh) {
          shown.current = new Set()
          return run(m, s + 1, false)
        }
        // "Nothing here" isn't an outage: show the empty state with "More time" / "Further".
        if (err instanceof OutingError || /Nothing found/i.test(msg)) {
          setOuting(null)
          setResult({ picks: [], pool: [], context: { rainy: false }, ai: false })
          onShow({ picks: [], loop: null })
          return
        }
        setError(
          /busy|Overpass/i.test(msg)
            ? 'OpenStreetMap is busy right now. Give it a few seconds and try again.'
            : /fetch|network|load failed|timed out/i.test(msg)
              ? 'Couldn’t reach the map data. Check your connection and try again.'
              : msg || 'Something went wrong.',
        )
      } finally {
        clearTimeout(slowTimer)
        if (!c.signal.aborted) setLoading(false)
      }
    },
    [at, time, reach, places, tiles, onShow],
  )

  // Re-run when the limits change on the results screen.
  useEffect(() => {
    if (mood) void run(mood, seed, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, time, reach])

  useEffect(() => () => ctrl.current?.abort(), [])

  const pickMood = (m: ViewMood) => {
    setCollapsed(false)
    setResult(null)
    setOuting(null)
    setSeed(0)
    setStage({ kind: 'results', mood: m })
  }
  const back = () => {
    setCollapsed(false)
    ctrl.current?.abort()
    setStage({ kind: 'moods' })
    setResult(null)
    setOuting(null)
    setError(null)
    setLoading(false)
    onShow({ picks: [], loop: null })
  }
  // ---- New food: cuisine chips, built from what's actually around you ----
  const cuisines = useMemo(() => {
    if (mood !== 'food') return []
    const counts = new Map<string, number>()
    for (const p of basePool) {
      const c = cuisineOf(p)
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([c]) => c)
  }, [basePool, mood])
  const byCuisine = useMemo(() => (cuisine ? basePool.filter((p) => cuisineOf(p) === cuisine) : []), [basePool, cuisine])
  const cuisinePicks = useMemo(() => {
    if (!cuisine || !byCuisine.length) return null
    const pages = Math.ceil(byCuisine.length / 4)
    const start = (cuisinePage % pages) * 4
    return byCuisine.slice(start, start + 4)
  }, [byCuisine, cuisine, cuisinePage])
  const picks = cuisinePicks ?? result?.picks ?? []
  // Keep the map pins in step with the chosen cuisine.
  useEffect(() => {
    if (cuisinePicks) onShow({ picks: cuisinePicks, loop: null })
    else if (cuisine === null && result && !result.loop) onShow({ picks: result.picks, loop: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuisinePicks, cuisine])

  const shuffle = () => {
    if (!mood) return
    if (cuisine) {
      setCuisinePage((p) => p + 1)
      return
    }
    const next = seed + 1
    setSeed(next)
    void run(mood, next, false)
  }
  const save = async (p: ExplorePick) => {
    await onSave(p)
    setSaved((s) => new Set(s).add(p.id))
  }

  const variants = mood ? variantsFor(mood) : undefined
  // A sunset spot shows as "Somewhere new" with the Sunset chip on, and so on.
  const M = mood ? MOOD_BY_KEY[variants?.group ?? mood] : null
  // One line that says what's on the map while the sheet is minimised.
  const summary = !collapsed
    ? undefined
    : outing
      ? `${outing.stops.length} stops · ${duration(outing.totalMin * 60_000)} · done by ${timeOfDay(outing.endsAt.getTime())}`
      : result?.loop
      ? `${(result.loop.distanceM / 1000).toFixed(1)} km loop · ${duration(result.loop.durationS * 1000)}`
      : picks.length
        ? `${picks.length} ${picks.length === 1 ? 'pick' : 'picks'} on the map · tap to see them`
        : 'Tap to open'

  return (
    <Sheet
      onClose={onClose}
      collapsed={collapsed}
      onToggleCollapse={mood ? () => setCollapsed(!collapsed) : undefined}
      subtitle={summary}
      eyebrow={M ? 'Explore' : approximate ? 'Around the map centre' : 'Explore'}
      title={M ? M.label : 'What do you feel like?'}
      leading={
        M ? (
          <motion.button className="icon-btn" onClick={back} whileTap={{ scale: 0.88 }} aria-label="Back to moods">
            <ArrowLeft size={18} strokeWidth={2.4} />
          </motion.button>
        ) : undefined
      }
      footer={
        M && (result || outing) && !loading && !error ? (
          <div className="btn-row">
            <motion.button className="btn grow" onClick={shuffle} whileTap={{ scale: 0.97 }}>
              <Shuffle size={17} strokeWidth={2.4} /> {mood === 'stroll' || mood === 'outing' ? 'Try another' : 'Shuffle'}
            </motion.button>
            {mood === 'outing' && outing && (
              <motion.button className="btn primary grow" onClick={() => onWalk({ ...outing.stops[0].pick, placeId: outing.stops[0].pick.savedPlaceId })} whileTap={{ scale: 0.97 }}>
                <Footprints size={17} strokeWidth={2.4} /> Start outing
              </motion.button>
            )}
            {mood === 'stroll' && result?.loop && (
              <motion.button className="btn primary grow" onClick={() => onStartLoop(result.loop!)} whileTap={{ scale: 0.97 }}>
                <Footprints size={17} strokeWidth={2.4} /> Start loop
              </motion.button>
            )}
          </div>
        ) : undefined
      }
    >
      {!at ? (
        <p className="body-muted">Finding where you are…</p>
      ) : stage.kind === 'moods' ? (
        <>
          {(() => {
            const now = rightNow(at)
            const N = MOOD_BY_KEY[now.mood]
            return (
              <motion.button
                className="right-now"
                style={{ '--c': N.color } as CSSProperties}
                onClick={() => {
                  if (now.time) setTime(now.time)
                  pickMood(now.mood)
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="mood-icon">
                  <N.icon size={22} strokeWidth={2.2} />
                </span>
                <span className="right-now-text">
                  <small>Right now</small>
                  <strong>{now.title}</strong>
                  <span>{now.text}</span>
                </span>
                <ChevronRight size={20} strokeWidth={2.4} className="right-now-go" />
              </motion.button>
            )
          })()}
          <div className="list-label">Or pick a mood</div>
          <div className="mood-grid">
            {TILES.map((k) => MOOD_BY_KEY[k]).map((m, i) => (
              <motion.button
                key={m.key}
                className="mood-tile"
                style={{ '--c': m.color } as CSSProperties}
                onClick={() => pickMood(m.key)}
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30, delay: i * 0.04 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="mood-icon">
                  <m.icon size={22} strokeWidth={2.2} />
                </span>
                <strong>{m.label}</strong>
                <small>{m.blurb}</small>
              </motion.button>
            ))}
          </div>
          <ExploreNext at={at} places={places} tiles={tiles} periods={['week']} label="This week’s picks" onFocus={onFocus} onWalk={onWalk} onSave={onSave} />
        </>
      ) : (
        <>
          <FilterBar
            key={mood}
            time={time}
            reach={reach}
            onTime={setTime}
            onReach={setReach}
            hideReach={mood === 'stroll' || mood === 'outing'}
            extra={result?.context && !loading ? <ContextChips ctx={result.context} ai={result.ai} /> : null}
          />
          {variants && (
            <div className="chips scroll variant-chips" role="radiogroup" aria-label="Kind">
              {variants.options.map(([k, label]) => (
                <button key={k} role="radio" aria-checked={mood === k} className={`chip ${mood === k ? 'is-on solid' : ''}`} onClick={() => mood !== k && pickMood(k)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {cuisines.length > 1 && !loading && (
            <motion.div className="chips scroll cuisine-chips" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="radiogroup" aria-label="Cuisine">
              <button role="radio" aria-checked={cuisine === null} className={`chip ${cuisine === null ? 'is-on solid' : ''}`} onClick={() => setCuisine(null)}>
                Any
              </button>
              {cuisines.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={cuisine === c}
                  className={`chip ${cuisine === c ? 'is-on solid' : ''}`}
                  onClick={() => {
                    setCuisine(cuisine === c ? null : c)
                    setCuisinePage(0)
                  }}
                >
                  {titleCase(c)}
                </button>
              ))}
            </motion.div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.div
                key="loading"
                className="explore-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
              >
                <p className="explore-status" role="status" aria-live="polite" style={{ '--c': M?.color } as CSSProperties}>
                  <span className="explore-status-dot" />
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={slow ? 'slow' : 'fast'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                      {slow ? 'Still looking. The free map servers are slow right now…' : `${mood ? SEARCHING[mood] : 'Looking'}…`}
                    </motion.span>
                  </AnimatePresence>
                </p>
                {[0, 1].map((i) => (
                  <span key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.12}s` }}>
                    <i />
                    <i />
                    <i />
                  </span>
                ))}
              </motion.div>
            ) : error ? (
              <motion.div key="error" className="explore-empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <span className="explore-empty-icon">
                  <CloudOff size={22} strokeWidth={2.2} />
                </span>
                <p>{error}</p>
                <button className="btn small" onClick={() => mood && run(mood, seed, true)}>
                  <RefreshCw size={15} /> Try again
                </button>
              </motion.div>
            ) : outing && at ? (
              <OutingCard
                key={`outing-${seed}`}
                outing={outing}
                from={at}
                saved={saved}
                onFocus={(p) => {
                  setCollapsed(true)
                  onFocus(p)
                }}
                onSave={save}
              />
            ) : result?.loop ? (
              <LoopCard key={`loop-${seed}`} loop={result.loop} weather={result.context.weather} />
            ) : result && picks.length === 0 ? (
              <motion.div key="none" className="explore-empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <span className="explore-empty-icon">
                  <Compass size={22} strokeWidth={2.2} />
                </span>
                <p>Nothing fits right now. Give yourself more time, or go a little further.</p>
                <div className="btn-row">
                  {time < 240 && (
                    <button className="btn small" onClick={() => setTime(nextUp(TIME_OPTIONS, time))}>
                      <Clock size={15} /> More time
                    </button>
                  )}
                  {reach < 30000 && mood !== 'stroll' && mood !== 'outing' && (
                    <button className="btn small" onClick={() => setReach(nextUp(REACH_OPTIONS, reach))}>
                      <MapPin size={15} /> Further
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.ul key={`picks-${seed}-${cuisine}-${cuisinePage}-${result?.ai}`} className="pick-list" exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                {picks.map((p, i) => (
                  <PickCard
                    key={p.id}
                    pick={p}
                    index={i}
                    saved={saved.has(p.id) || !!p.savedPlaceId}
                    onFocus={() => {
                      setCollapsed(true)
                      onFocus(p)
                    }}
                    onWalk={() => onWalk({ ...p, placeId: p.savedPlaceId })}
                    onSave={() => save(p)}
                  />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </Sheet>
  )
}

function nextUp<T extends number>(options: readonly (readonly [T, string])[], value: T): T {
  const i = options.findIndex(([v]) => v === value)
  return options[Math.min(options.length - 1, i + 1)][0]
}

/**
 * Time and distance as two compact pills; tapping one opens its options in a
 * drawer underneath. Keeps the results, not the controls, on screen.
 */
function FilterBar({
  time,
  reach,
  onTime,
  onReach,
  hideReach,
  extra,
}: {
  time: TimeBudget
  reach: Reach
  onTime(t: TimeBudget): void
  onReach(r: Reach): void
  hideReach?: boolean
  extra?: ReactNode
}) {
  const [open, setOpen] = useState<'time' | 'reach' | null>(null)
  const label = <T extends number>(opts: readonly (readonly [T, string])[], v: T) => opts.find(([x]) => x === v)?.[1] ?? ''
  const pill = (key: 'time' | 'reach', Icon: LucideIcon, text: string, aria: string) => (
    <motion.button
      key={key}
      className={`filter-pill ${open === key ? 'is-open' : ''}`}
      onClick={() => setOpen(open === key ? null : key)}
      aria-expanded={open === key}
      aria-label={`${aria}: ${text}`}
      whileTap={{ scale: 0.95 }}
    >
      <Icon size={15} strokeWidth={2.4} />
      <span>{text}</span>
      <ChevronDown size={14} strokeWidth={2.6} className="filter-caret" />
    </motion.button>
  )
  return (
    <div className="filter-bar">
      <div className="filter-pills">
        {pill('time', Clock, label(TIME_OPTIONS, time), 'Time you’ve got')}
        {!hideReach && pill('reach', MapPin, label(REACH_OPTIONS, reach), 'How far')}
        {extra}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="drawer"
            className="filter-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            {open === 'time' ? (
              <ChipRow
                label="Time you’ve got"
                options={TIME_OPTIONS}
                value={time}
                onChange={(v) => {
                  onTime(v)
                  setOpen(null)
                }}
              />
            ) : (
              <ChipRow
                label="How far you’ll go"
                options={REACH_OPTIONS}
                value={reach}
                onChange={(v) => {
                  onReach(v)
                  setOpen(null)
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ChipRow<T extends number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange(v: T): void
}) {
  return (
    <div className="chip-row" role="radiogroup" aria-label={label}>
      <span className="chip-row-label">{label}</span>
      <div className="chips">
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={v === value} className={`chip ${v === value ? 'is-on' : ''}`} onClick={() => onChange(v)}>
            {v === value && <motion.span layoutId={`chip-${label}`} className="chip-thumb" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
            <span>{l}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Weather, sunset and the AI tag, riding along in the filter row. */
function ContextChips({ ctx, ai }: { ctx: ExploreResult['context']; ai: boolean }) {
  const toSunset = ctx.sunset ? ctx.sunset.getTime() - Date.now() : null
  return (
    <>
      {ctx.weather && (
        <motion.span className={`context-chip ${ctx.rainy ? 'wet' : ''}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
          {ctx.rainy ? <CloudRain size={14} strokeWidth={2.4} /> : <CloudSun size={14} strokeWidth={2.4} />}
          {cap(ctx.weather)}
        </motion.span>
      )}
      {ctx.sunset && toSunset !== null && toSunset > 0 && toSunset < 12 * 3_600_000 && (
        <motion.span className="context-chip sun" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}>
          <Sunset size={14} strokeWidth={2.4} />
          {timeOfDay(ctx.sunset.getTime())}
        </motion.span>
      )}
      {ai && (
        <motion.span className="context-chip ai-tag" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <Sparkles size={12} /> AI picks
        </motion.span>
      )}
    </>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const titleCase = (s: string) => s.replace(/(^|\s)\w/g, (c) => c.toUpperCase())
/** One cuisine per place, lower-case ("thai", "pizza"); cafés without a tag count as "coffee". */
function cuisineOf(p: ExplorePick): string | null {
  const c = p.cuisine?.toLowerCase().trim()
  if (c) return c === 'coffee shop' ? 'coffee' : c
  return p.category === 'cafe' ? 'coffee' : p.category === 'ice_cream' ? 'ice cream' : p.category === 'bakery' ? 'bakery' : null
}

function PickCard({
  pick,
  index,
  saved,
  onFocus,
  onWalk,
  onSave,
}: {
  pick: ExplorePick
  index: number
  saved: boolean
  onFocus(): void
  onWalk(): void
  onSave(): void
}) {
  const kind = cap(pick.cuisine && pick.category === 'restaurant' ? `${cap(pick.cuisine)} restaurant` : prettyKind(pick.category))
  return (
    <motion.li
      className="pick-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: index * 0.06 }}
    >
      <button className="pick-main" onClick={onFocus} aria-label={`Show ${pick.name} on the map`}>
        <IconTile icon={categoryIcon(pick.category)} color="var(--accent)" size={42} />
        <span className="pick-text">
          <strong>{pick.name}</strong>
          <small>{kind}</small>
        </span>
        <MapPin size={16} strokeWidth={2.3} className="pick-locate" aria-hidden />
      </button>
      <p className="pick-reason">{pick.reason}</p>
      <div className="fact-chips">
        {pick.facts.map((f) => (
          <span key={f} className={`fact ${/^(Never been|On your Want to go list)$/.test(f) ? 'new' : /^(Open|Closes)/.test(f) ? 'open' : ''}`}>
            {f}
          </span>
        ))}
      </div>
      <div className="pick-actions">
        <motion.button className="btn small grow" whileTap={{ scale: 0.96 }} onClick={onSave} disabled={saved} aria-label={saved ? 'On your Want to go list' : 'Add to Want to go'}>
          {saved ? <BookmarkCheck size={16} strokeWidth={2.4} /> : <Bookmark size={16} strokeWidth={2.4} />}
          {saved ? 'Added' : 'Want to go'}
        </motion.button>
        {pick.far ? (
          <motion.a className="btn small primary grow" whileTap={{ scale: 0.96 }} href={directionsUrl(pick, pick.name)} target="_blank" rel="noreferrer">
            <Navigation size={16} strokeWidth={2.4} /> Directions
          </motion.a>
        ) : (
          <motion.button className="btn small primary grow" whileTap={{ scale: 0.96 }} onClick={onWalk}>
            <Footprints size={16} strokeWidth={2.4} /> Walk there
          </motion.button>
        )}
      </div>
    </motion.li>
  )
}

const ROLE_LABEL = { coffee: 'Coffee', food: 'A bite to eat', sight: '' } as const

/** The outing as a timeline: when you'll reach each stop, how long to stay, and the walk between. */
function OutingCard({
  outing,
  from,
  saved,
  onFocus,
  onSave,
}: {
  outing: Outing
  from: LatLng
  saved: Set<string>
  onFocus(p: ExplorePick): void
  onSave(p: ExplorePick): Promise<void>
}) {
  return (
    <motion.div className="outing" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <div className="loop-stats outing-stats">
        <div>
          <strong className="display">{duration(outing.totalMin * 60_000)}</strong>
          <small>all in</small>
        </div>
        <div>
          <strong className="display">{(outing.route.distanceM / 1000).toFixed(1)}</strong>
          <small>km walking</small>
        </div>
        <div>
          <strong className="display">{timeOfDay(outing.endsAt.getTime())}</strong>
          <small>done by</small>
        </div>
      </div>

      <ol className="outing-steps">
        {outing.stops.map((st, i) => {
          const isSaved = saved.has(st.pick.id) || !!st.pick.savedPlaceId
          const kind = ROLE_LABEL[st.role] || cap(prettyKind(st.pick.category))
          return (
            <motion.li
              key={st.pick.id}
              className="outing-step"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.06 + i * 0.07 }}
            >
              <div className="outing-leg">
                <Footprints size={13} strokeWidth={2.4} /> {st.walkMin} min walk
              </div>
              <div className="outing-stop">
                <span className="outing-num">{i + 1}</span>
                <button className="outing-main" onClick={() => onFocus(st.pick)} aria-label={`Show ${st.pick.name} on the map`}>
                  <span className="outing-when">
                    {timeOfDay(st.arriveAt.getTime())} · {kind} · {st.stayMin} min
                  </span>
                  <strong>{st.pick.name}</strong>
                  <span className="outing-reason">{st.pick.reason}</span>
                  {st.hours && <span className="fact open">{st.hours} when you arrive</span>}
                </button>
                <motion.button
                  className="icon-btn"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onSave(st.pick)}
                  disabled={isSaved}
                  aria-label={isSaved ? 'On your Want to go list' : `Add ${st.pick.name} to Want to go`}
                >
                  {isSaved ? <BookmarkCheck size={16} strokeWidth={2.4} /> : <Bookmark size={16} strokeWidth={2.4} />}
                </motion.button>
              </div>
            </motion.li>
          )
        })}
      </ol>

      <div className="pick-actions">
        <motion.a
          className="btn small grow"
          whileTap={{ scale: 0.96 }}
          href={outingMapsUrl(from, outing.stops.map((st) => st.pick))}
          target="_blank"
          rel="noreferrer"
        >
          <Navigation size={16} strokeWidth={2.4} /> Full route in Maps
        </motion.a>
      </div>
    </motion.div>
  )
}

function LoopCard({ loop, weather }: { loop: Route; weather?: string }) {
  const back = Date.now() + loop.durationS * 1000
  return (
    <motion.div className="loop-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <span className="loop-icon">
        <Trees size={22} strokeWidth={2.2} />
      </span>
      <div className="loop-stats">
        <div>
          <strong className="display">{(loop.distanceM / 1000).toFixed(1)}</strong>
          <small>km loop</small>
        </div>
        <div>
          <strong className="display">{duration(loop.durationS * 1000)}</strong>
          <small>walking</small>
        </div>
        <div>
          <strong className="display">{timeOfDay(back)}</strong>
          <small>back by</small>
        </div>
      </div>
      <p className="body-muted">
        Starts and ends where you are. It’s drawn on the map{weather ? `, and it’s ${weather} out` : ''}.
      </p>
    </motion.div>
  )
}

// ---------------------------------------------------------------- Explore next ----

const ALL_PERIODS: { key: PickPeriod; title: string; icon: LucideIcon }[] = [
  { key: 'week', title: 'This week', icon: Sparkles },
  { key: 'month', title: 'This month', icon: CalendarDays },
  { key: 'year', title: 'This year', icon: Mountain },
]

/**
 * Suggestions kept for a week / month / year. Explore shows this week's;
 * the You sheet's "Your map" shows the bigger month and year adventures.
 */
export function ExploreNext({
  at,
  places,
  tiles,
  periods = ['week', 'month', 'year'],
  label = 'Explore next',
  onFocus,
  onWalk,
  onSave,
}: {
  at: LatLng
  places: PlaceWithStats[]
  tiles?: TilePois
  periods?: PickPeriod[]
  label?: string
  onFocus(at: LatLng): void
  onWalk: Props['onWalk']
  onSave: Props['onSave']
}) {
  const PERIODS = ALL_PERIODS.filter((p) => periods.includes(p.key))
  const [picks, setPicks] = useState<Partial<Record<PickPeriod, Pick | 'loading' | 'error'>>>({})
  const atRef = useRef(at)
  const placesRef = useRef(places)
  const tilesRef = useRef(tiles)
  atRef.current = at
  placesRef.current = places
  tilesRef.current = tiles
  /** Cancelled when Explore closes or a mood is picked, so these never compete with the search you asked for. */
  const ctrl = useRef(new AbortController())
  useEffect(() => {
    const c = new AbortController()
    ctrl.current = c
    return () => c.abort()
  }, [])

  const load = useCallback(async (period: PickPeriod, regenerate = false) => {
    const signal = ctrl.current.signal
    setPicks((p) => ({ ...p, [period]: 'loading' }))
    try {
      const existing = regenerate ? undefined : await currentPick(period)
      const pick =
        existing ?? (await makePick(period, atRef.current, placesRef.current, regenerate ? Date.now() % 1000 : 0, signal, tilesRef.current))
      if (!signal.aborted) setPicks((p) => ({ ...p, [period]: pick }))
    } catch {
      if (!signal.aborted) setPicks((p) => ({ ...p, [period]: 'error' }))
    }
  }, [])

  useEffect(() => {
    // One after another, to go easy on the free servers; a beat first so a quick mood tap wins.
    const timer = setTimeout(() => {
      void (async () => {
        for (const key of periods) {
          if (ctrl.current.signal.aborted) return
          await load(key)
        }
      })()
    }, 400)
    return () => clearTimeout(timer)
    // `periods` is fixed for each place this is used.
  }, [load])

  return (
    <section className="explore-next">
      {/* A single card carries the label itself, rather than "This week's picks" over "This week". */}
      {PERIODS.length > 1 && <div className="list-label">{label}</div>}
      {PERIODS.map(({ key, title, icon: Icon }, i) => {
        const state = picks[key]
        return (
          <motion.div
            key={key}
            className="next-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.07 }}
          >
            <div className="next-head">
              <span className="next-icon">
                <Icon size={15} strokeWidth={2.4} />
              </span>
              <strong>{PERIODS.length > 1 ? title : label}</strong>
              {state && state !== 'loading' && state !== 'error' && state.ai && (
                <span className="ai-tag">
                  <Sparkles size={11} /> AI
                </span>
              )}
              <button className="next-refresh" onClick={() => load(key, true)} disabled={state === 'loading'} aria-label={`New ${title.toLowerCase()} picks`}>
                <RefreshCw size={14} className={state === 'loading' ? 'spin' : ''} />
              </button>
            </div>
            {state === 'loading' || !state ? (
              <span className="skeleton-line" />
            ) : state === 'error' ? (
              <p className="next-error">Couldn’t reach OpenStreetMap. Tap refresh to try again.</p>
            ) : (
              <ul className="next-items">
                {(state.items ?? []).map((item) => (
                  <NextItem key={`${item.name}-${item.lat}`} item={item} far={key !== 'week'} onFocus={onFocus} onWalk={onWalk} onSave={onSave} />
                ))}
              </ul>
            )}
          </motion.div>
        )
      })}
    </section>
  )
}

function NextItem({
  item,
  far,
  onFocus,
  onWalk,
  onSave,
}: {
  item: PickItem
  far: boolean
  onFocus(at: LatLng): void
  onWalk: Props['onWalk']
  onSave: Props['onSave']
}) {
  const [saved, setSaved] = useState(false)
  return (
    <li className="next-item">
      <button className="next-main" onClick={() => onFocus(item)}>
        <strong>{item.name}</strong>
        <small>{item.reason}</small>
        {item.meta && <em>{item.meta}</em>}
      </button>
      <div className="next-actions">
        {!far && (
          <button
            className="icon-btn"
            aria-label={saved ? 'On your Want to go list' : 'Add to Want to go'}
            disabled={saved}
            onClick={async () => {
              await onSave(item)
              setSaved(true)
            }}
          >
            {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>
        )}
        {far ? (
          <a className="icon-btn accent" href={directionsUrl(item, item.name)} target="_blank" rel="noreferrer" aria-label="Directions">
            <Navigation size={15} />
          </a>
        ) : (
          <button className="icon-btn accent" onClick={() => onWalk(item)} aria-label={`Walk to ${item.name}`}>
            <Footprints size={15} />
          </button>
        )}
      </div>
    </li>
  )
}
