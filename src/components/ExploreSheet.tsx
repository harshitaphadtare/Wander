import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Coffee,
  Compass,
  Footprints,
  Mountain,
  Navigation,
  RefreshCw,
  Shuffle,
  Sparkles,
  Sunset,
  Trees,
  UtensilsCrossed,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import { aiAvailable } from '../lib/ai'
import type { Pick, PickItem } from '../lib/db'
import {
  directionsUrl,
  explore,
  prettyKind,
  REACH_OPTIONS,
  TIME_OPTIONS,
  type ExplorePick,
  type ExploreResult,
  type Mood,
  type Reach,
  type TimeBudget,
} from '../lib/explore'
import { duration, timeOfDay } from '../lib/format'
import type { LatLng } from '../lib/geo'
import { currentPick, makePick, type PickPeriod } from '../lib/picks'
import type { Route } from '../lib/routing'
import { IconTile } from '../ui/bits'
import { categoryIcon } from '../ui/icons'
import Sheet from '../ui/Sheet'

const MOODS: { key: Mood; label: string; blurb: string; icon: LucideIcon; color: string }[] = [
  { key: 'stroll', label: 'Stroll', blurb: 'A loop from here', icon: Footprints, color: '#12A187' },
  { key: 'new', label: 'Somewhere new', blurb: 'Parks, galleries, views', icon: Compass, color: '#2F7BF6' },
  { key: 'food', label: 'New food', blurb: 'Never eaten there', icon: UtensilsCrossed, color: '#E8457A' },
  { key: 'coffee', label: 'Coffee break', blurb: 'Open now, close by', icon: Coffee, color: '#B5651D' },
  { key: 'sunset', label: 'Sunset spot', blurb: 'Before the light goes', icon: Sunset, color: '#F2542D' },
  { key: 'hike', label: 'Hike', blurb: 'Trails and lookouts', icon: Mountain, color: '#5B7F3A' },
  { key: 'surprise', label: 'Surprise me', blurb: 'One confident pick', icon: Wand2, color: '#7357F6' },
]
const MOOD_BY_KEY = Object.fromEntries(MOODS.map((m) => [m.key, m])) as Record<Mood, (typeof MOODS)[number]>

export interface ExploreShow {
  picks: { id: string; name: string; lat: number; lng: number; category: string }[]
  loop: Route | null
}

interface Props {
  at: LatLng | null
  /** true when `at` is the map centre because there's no location fix */
  approximate: boolean
  places: PlaceWithStats[]
  onShow(show: ExploreShow): void
  onFocus(at: LatLng): void
  onWalk(pick: { name: string; lat: number; lng: number; osmId?: string; category?: string; placeId?: string }): void
  onSave(pick: { name: string; lat: number; lng: number; osmId?: string; category?: string; address?: string }): Promise<void>
  onClose(): void
}

type Stage = { kind: 'moods' } | { kind: 'results'; mood: Mood }

export default function ExploreSheet({ at, approximate, places, onShow, onFocus, onWalk, onSave, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'moods' })
  const [time, setTime] = useState<TimeBudget>(60)
  const [reach, setReach] = useState<Reach>(1500)
  const [result, setResult] = useState<ExploreResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [seed, setSeed] = useState(0)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const shown = useRef(new Set<string>())
  const ctrl = useRef<AbortController | null>(null)

  const mood = stage.kind === 'results' ? stage.mood : null

  const run = useCallback(
    async (m: Mood, s: number, fresh: boolean) => {
      if (!at) return
      ctrl.current?.abort()
      const c = new AbortController()
      ctrl.current = c
      if (fresh) shown.current = new Set()
      setLoading(true)
      setError(null)
      try {
        const r = await explore({ mood: m, at, time, reach, places, seed: s, exclude: shown.current, useAi: aiAvailable, signal: c.signal })
        if (c.signal.aborted) return
        // Shuffle: when the pool runs dry, start over rather than showing nothing.
        if (!r.picks.length && !r.loop && shown.current.size) {
          shown.current = new Set()
          return run(m, s + 1, false)
        }
        r.picks.forEach((p) => shown.current.add(p.id))
        setResult(r)
        onShow({ picks: r.picks, loop: r.loop ?? null })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError(
          /busy|Overpass/i.test((err as Error).message)
            ? 'OpenStreetMap is busy right now. Give it a few seconds and try again.'
            : (err as Error).message || 'Something went wrong.',
        )
      } finally {
        if (!c.signal.aborted) setLoading(false)
      }
    },
    [at, time, reach, places, onShow],
  )

  // Re-run when the limits change on the results screen.
  useEffect(() => {
    if (mood) void run(mood, seed, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, time, reach])

  useEffect(() => () => ctrl.current?.abort(), [])

  const pickMood = (m: Mood) => {
    setResult(null)
    setSeed(0)
    setStage({ kind: 'results', mood: m })
  }
  const back = () => {
    ctrl.current?.abort()
    setStage({ kind: 'moods' })
    setResult(null)
    setLoading(false)
    onShow({ picks: [], loop: null })
  }
  const shuffle = () => {
    if (!mood) return
    const next = seed + 1
    setSeed(next)
    void run(mood, next, false)
  }
  const save = async (p: ExplorePick) => {
    await onSave(p)
    setSaved((s) => new Set(s).add(p.id))
  }

  const M = mood ? MOOD_BY_KEY[mood] : null

  return (
    <Sheet
      onClose={onClose}
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
        M && (result || error) ? (
          <div className="btn-row">
            <motion.button className="btn grow" onClick={shuffle} disabled={loading} whileTap={{ scale: 0.97 }}>
              <Shuffle size={17} strokeWidth={2.4} /> {mood === 'stroll' ? 'Another loop' : 'Shuffle'}
            </motion.button>
          </div>
        ) : undefined
      }
    >
      {!at ? (
        <p className="body-muted">Finding where you are…</p>
      ) : stage.kind === 'moods' ? (
        <>
          <div className="mood-grid">
            {MOODS.map((m, i) => (
              <motion.button
                key={m.key}
                className={`mood-tile ${m.key === 'surprise' ? 'wide' : ''}`}
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
          <Limits time={time} reach={reach} onTime={setTime} onReach={setReach} />
          <ExploreNext at={at} places={places} onFocus={onFocus} onWalk={onWalk} onSave={onSave} />
        </>
      ) : (
        <>
          <Limits time={time} reach={reach} onTime={setTime} onReach={setReach} compact hideReach={mood === 'stroll'} />
          {result?.context && <ContextLine ctx={result.context} ai={result.ai} />}
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" className="explore-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </motion.div>
            ) : error ? (
              <motion.div key="error" className="explore-empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <p>{error}</p>
                <button className="btn small" onClick={() => mood && run(mood, seed, true)}>
                  <RefreshCw size={15} /> Try again
                </button>
              </motion.div>
            ) : result?.loop ? (
              <LoopCard key={`loop-${seed}`} loop={result.loop} weather={result.context.weather} />
            ) : result && result.picks.length === 0 ? (
              <motion.div key="none" className="explore-empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <p>Nothing fits right now. Try more time or a bigger radius.</p>
              </motion.div>
            ) : (
              <motion.ul key={`picks-${seed}`} className="pick-list">
                {result?.picks.map((p, i) => (
                  <PickCard
                    key={p.id}
                    pick={p}
                    index={i}
                    saved={saved.has(p.id) || !!p.savedPlaceId}
                    onFocus={() => onFocus(p)}
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

function Limits({
  time,
  reach,
  onTime,
  onReach,
  compact,
  hideReach,
}: {
  time: TimeBudget
  reach: Reach
  onTime(t: TimeBudget): void
  onReach(r: Reach): void
  compact?: boolean
  hideReach?: boolean
}) {
  return (
    <div className={`limits ${compact ? 'compact' : ''}`}>
      <ChipRow label="Time" options={TIME_OPTIONS} value={time} onChange={onTime} />
      {!hideReach && <ChipRow label="How far" options={REACH_OPTIONS} value={reach} onChange={onReach} />}
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

function ContextLine({ ctx, ai }: { ctx: ExploreResult['context']; ai: boolean }) {
  const toSunset = ctx.sunset ? ctx.sunset.getTime() - Date.now() : null
  return (
    <motion.div className="context-line" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
      {ctx.weather && <span>{ctx.rainy ? `${cap(ctx.weather)} · indoor picks first` : cap(ctx.weather)}</span>}
      {ctx.sunset && toSunset !== null && toSunset > 0 && toSunset < 12 * 3_600_000 && (
        <span>
          Sunset {timeOfDay(ctx.sunset.getTime())} · {duration(toSunset)} left
        </span>
      )}
      {ai && (
        <span className="ai-tag">
          <Sparkles size={12} /> Picked with AI
        </span>
      )}
    </motion.div>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

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
  return (
    <motion.li
      className="pick-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, delay: index * 0.06 }}
    >
      <button className="pick-main" onClick={onFocus}>
        <IconTile icon={categoryIcon(pick.category)} color="var(--accent)" size={42} />
        <span className="pick-text">
          <strong>{pick.name}</strong>
          <small>{cap(pick.cuisine && pick.category === 'restaurant' ? `${cap(pick.cuisine)} restaurant` : prettyKind(pick.category))}</small>
        </span>
      </button>
      <p className="pick-reason">{pick.reason}</p>
      <div className="fact-chips">
        {pick.facts.map((f) => (
          <span key={f} className={`fact ${/^(Never been|On your wishlist)$/.test(f) ? 'new' : ''}`}>
            {f}
          </span>
        ))}
      </div>
      <div className="pick-actions">
        <motion.button className="btn small grow" whileTap={{ scale: 0.96 }} onClick={onSave} disabled={saved} aria-label={saved ? 'Saved' : 'Save to wishlist'}>
          {saved ? <BookmarkCheck size={16} strokeWidth={2.4} /> : <Bookmark size={16} strokeWidth={2.4} />}
          {saved ? 'Saved' : 'Want to go'}
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

const PERIODS: { key: PickPeriod; title: string; icon: LucideIcon }[] = [
  { key: 'week', title: 'This week', icon: Sparkles },
  { key: 'month', title: 'This month', icon: CalendarDays },
  { key: 'year', title: 'This year', icon: Mountain },
]

function ExploreNext({
  at,
  places,
  onFocus,
  onWalk,
  onSave,
}: {
  at: LatLng
  places: PlaceWithStats[]
  onFocus(at: LatLng): void
  onWalk: Props['onWalk']
  onSave: Props['onSave']
}) {
  const [picks, setPicks] = useState<Partial<Record<PickPeriod, Pick | 'loading' | 'error'>>>({})
  const atRef = useRef(at)
  const placesRef = useRef(places)
  atRef.current = at
  placesRef.current = places

  const load = useCallback(async (period: PickPeriod, regenerate = false) => {
    setPicks((p) => ({ ...p, [period]: 'loading' }))
    try {
      const existing = regenerate ? undefined : await currentPick(period)
      const pick = existing ?? (await makePick(period, atRef.current, placesRef.current, regenerate ? Date.now() % 1000 : 0))
      setPicks((p) => ({ ...p, [period]: pick }))
    } catch {
      setPicks((p) => ({ ...p, [period]: 'error' }))
    }
  }, [])

  useEffect(() => {
    // One after another, to go easy on the free Overpass servers.
    void (async () => {
      for (const { key } of PERIODS) await load(key)
    })()
  }, [load])

  return (
    <section className="explore-next">
      <div className="list-label">Explore next</div>
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
              <strong>{title}</strong>
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
            aria-label={saved ? 'Saved' : 'Save to wishlist'}
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
