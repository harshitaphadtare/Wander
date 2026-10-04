import {
  ChevronLeft,
  Clock,
  Coffee,
  Croissant,
  IceCreamCone,
  Search,
  Settings2,
  Trees,
  UtensilsCrossed,
  Wine,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import { plural } from '../lib/format'
import { distanceM, formatDistance, type LatLng } from '../lib/geo'
import type { OsmPoi } from '../lib/overpass'
import { prettyCategory, searchNearbyCategory, searchPlaces, type PhotonPlace } from '../lib/photon'
import { IconTile, Stagger } from '../ui/bits'
import { categoryIcon, LEVEL_ICONS } from '../ui/icons'

interface Category {
  key: string
  label: string
  /** OpenMapTiles poi classes, read straight from the map (matches what you see) */
  classes: string[]
  /** Photon fallback: text query + OSM tag filters */
  q: string
  tags: string[]
  icon: LucideIcon
  color: string
}

const CATEGORIES: Category[] = [
  { key: 'coffee', label: 'Coffee', classes: ['cafe'], q: 'cafe', tags: ['amenity:cafe'], icon: Coffee, color: '#A0612F' },
  { key: 'food', label: 'Food', classes: ['restaurant', 'fast_food'], q: 'restaurant', tags: ['amenity:restaurant'], icon: UtensilsCrossed, color: '#E0573A' },
  { key: 'bakery', label: 'Bakery', classes: ['bakery'], q: 'bakery', tags: ['shop:bakery'], icon: Croissant, color: '#D48600' },
  { key: 'drinks', label: 'Drinks', classes: ['bar', 'beer'], q: 'bar', tags: ['amenity:bar', 'amenity:pub'], icon: Wine, color: '#7357F6' },
  { key: 'parks', label: 'Parks', classes: ['park'], q: 'park', tags: ['leisure:park'], icon: Trees, color: '#12A187' },
  { key: 'dessert', label: 'Dessert', classes: ['ice_cream'], q: 'ice cream', tags: ['amenity:ice_cream'], icon: IceCreamCone, color: '#E8457A' },
]

/** Within this distance counts as "nearby" for the category tiles. */
const NEARBY_RADIUS_M = 1500

const RECENTS_KEY = 'wander:recent-searches'
const MAX_RECENTS = 5

function loadRecents(): PhotonPlace[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
  } catch {
    return []
  }
}

function rememberRecent(place: PhotonPlace) {
  const key = (p: PhotonPlace) => p.osmId ?? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
  const next = [place, ...loadRecents().filter((p) => key(p) !== key(place))].slice(0, MAX_RECENTS)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* storage full / blocked: recents are a nicety */
  }
}

interface Props {
  places: PlaceWithStats[]
  near: () => LatLng | null
  from: LatLng | null
  onPickSaved(place: PlaceWithStats): void
  onPickResult(place: PhotonPlace): void
  onOpenSettings(): void
  /** Places already on the map near a point (instant; covers far more than name search). */
  nearbyFromMap?: (at: LatLng, radiusM: number, classes: string[]) => OsmPoi[]
}

export default function SearchBar({ places, near, from, onPickSaved, onPickResult, onOpenSettings, nearbyFromMap }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(false)
  const [category, setCategory] = useState<Category | null>(null)
  const [results, setResults] = useState<PhotonPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recents, setRecents] = useState<PhotonPlace[]>(loadRecents)
  const input = useRef<HTMLInputElement>(null)

  const q = query.trim()

  const savedMatches = useMemo(() => {
    if (category) return []
    if (!q) return [...places].sort((a, b) => b.visitCount - a.visitCount).slice(0, 4)
    const needle = q.toLowerCase()
    return places.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 4)
  }, [places, q, category])

  // Text search (debounced) or a nearby-category search; abort stale requests.
  useEffect(() => {
    if (!category && q.length < 2) {
      setResults([])
      setError(null)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(
      async () => {
        setLoading(true)
        try {
          const at = near()
          let found: PhotonPlace[] = []
          if (category && at) {
            // The map's own data first; fall back to Photon when the map isn't showing this area.
            const fromMap = (nearbyFromMap?.(at, NEARBY_RADIUS_M, category.classes) ?? []).map(
              (p): PhotonPlace => ({ name: p.name, lat: p.lat, lng: p.lng, category: p.category }),
            )
            if (fromMap.length >= 3) {
              found = fromMap.slice(0, 30)
            } else {
              // Photon is name-biased, so keep it honest: nearby only, one entry per place.
              const seen = new Set<string>()
              found = (await searchNearbyCategory(category.q, category.tags, at, ctrl.signal)).filter((p) => {
                const key = `${p.name}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`
                if (seen.has(key) || distanceM(at, p) > NEARBY_RADIUS_M * 3) return false
                seen.add(key)
                return true
              })
            }
          } else if (!category) {
            found = await searchPlaces(q, at ?? undefined, ctrl.signal)
          }
          const savedOsm = new Set(places.map((p) => p.osmId).filter(Boolean))
          setResults(found.filter((r) => !r.osmId || !savedOsm.has(r.osmId)))
          setError(category && !at ? 'Turn on location to see places near you.' : null)
        } catch (err) {
          if ((err as Error).name !== 'AbortError')
            setError(navigator.onLine ? 'Search is unavailable right now.' : "You're offline. Showing your places only.")
        } finally {
          if (!ctrl.signal.aborted) setLoading(false)
        }
      },
      category ? 0 : 280,
    )
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
    // `near` and `places` are read at call time on purpose; re-search only when the query changes.
  }, [q, category])

  const close = () => {
    input.current?.blur()
    setActive(false)
    setQuery('')
    setCategory(null)
  }
  const pickSaved = (p: PlaceWithStats) => {
    onPickSaved(p)
    close()
  }
  const pickResult = (r: PhotonPlace) => {
    rememberRecent(r)
    setRecents(loadRecents())
    onPickResult(r)
    close()
  }
  const chooseCategory = (c: Category) => {
    input.current?.blur() // show results full-height without the keyboard
    setQuery('')
    setResults([])
    setCategory(c)
  }

  const dist = (p: LatLng) => (from ? formatDistance(distanceM(from, p)) : null)
  const browsing = !q && !category
  let i = 0

  const resultRow = (r: PhotonPlace, idx: number, tint?: string) => (
    <Stagger key={r.osmId ?? `${r.lat},${r.lng},${idx}`} index={i++}>
      <button className="row" onClick={() => pickResult(r)}>
        <IconTile icon={categoryIcon(r.category)} color={tint ?? 'var(--ink-2)'} />
        <span className="row-text">
          <strong>{r.name}</strong>
          <small>{[prettyCategory(r.category), r.address].filter(Boolean).join(' · ')}</small>
        </span>
        {dist(r) && <span className="row-meta">{dist(r)}</span>}
      </button>
    </Stagger>
  )

  return (
    <div className={`search ${active ? 'is-active' : ''}`}>
      <AnimatePresence>
        {active && (
          <motion.div
            className="search-backdrop"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      <div className="search-row">
        <motion.form
          layout
          className="search-field glass"
          role="search"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (q && savedMatches[0]) pickSaved(savedMatches[0])
            else if (results[0]) pickResult(results[0])
          }}
        >
          {category ? (
            <button type="button" className="search-back" onClick={() => setCategory(null)} aria-label="Back to search">
              <ChevronLeft size={20} strokeWidth={2.4} />
            </button>
          ) : (
            <Search size={18} strokeWidth={2.3} className="search-icon" />
          )}
          {category && (
            <span className="search-chip" style={{ '--c': category.color } as CSSProperties}>
              <category.icon size={13} strokeWidth={2.6} /> {category.label} nearby
            </span>
          )}
          <input
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={category ? '' : 'Search places'}
            value={query}
            onChange={(e) => {
              setCategory(null)
              setQuery(e.target.value)
            }}
            onFocus={() => setActive(true)}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            aria-label="Search places"
          />
          {loading && <span className="spinner" aria-label="Searching" />}
          {query && (
            <button type="button" className="clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={14} strokeWidth={3} />
            </button>
          )}
        </motion.form>

        <AnimatePresence mode="popLayout" initial={false}>
          {active ? (
            <motion.button
              key="cancel"
              className="search-cancel"
              onClick={close}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
            >
              Cancel
            </motion.button>
          ) : (
            <motion.button
              key="settings"
              className="avatar-btn glass"
              onClick={onOpenSettings}
              aria-label="Settings"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileTap={{ scale: 0.9 }}
            >
              <Settings2 size={19} strokeWidth={2.2} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            className="search-panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onPointerDown={(e) => {
              // Keep focus in the input while tapping results (no keyboard flicker).
              if (!category && (e.target as HTMLElement).closest('button')) e.preventDefault()
            }}
          >
            {browsing && (
              <section>
                <div className="list-label">Find nearby</div>
                <div className="category-grid">
                  {CATEGORIES.map((c, idx) => (
                    <motion.button
                      key={c.key}
                      className="category-tile"
                      style={{ '--c': c.color } as CSSProperties}
                      onClick={() => chooseCategory(c)}
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: idx * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="category-icon">
                        <c.icon size={22} strokeWidth={2.2} />
                      </span>
                      {c.label}
                    </motion.button>
                  ))}
                </div>
              </section>
            )}

            {browsing && recents.length > 0 && (
              <section>
                <div className="list-label">Recent</div>
                <ul className="rows">
                  {recents.map((r, idx) => (
                    <Stagger key={r.osmId ?? `${r.lat},${r.lng},${idx}`} index={i++}>
                      <button className="row" onClick={() => pickResult(r)}>
                        <IconTile icon={Clock} color="var(--ink-3)" />
                        <span className="row-text">
                          <strong>{r.name}</strong>
                          <small>{[prettyCategory(r.category), r.address].filter(Boolean).join(' · ') || 'Place'}</small>
                        </span>
                        {dist(r) && <span className="row-meta">{dist(r)}</span>}
                      </button>
                    </Stagger>
                  ))}
                </ul>
              </section>
            )}

            {savedMatches.length > 0 && (
              <section>
                <div className="list-label">{q ? 'Your places' : 'Your top places'}</div>
                <ul className="rows">
                  {savedMatches.map((p) => (
                    <Stagger key={p.id} index={i++}>
                      <button className="row" onClick={() => pickSaved(p)}>
                        <IconTile icon={LEVEL_ICONS[p.level.key]} color={p.level.color} />
                        <span className="row-text">
                          <strong>{p.name}</strong>
                          <small>
                            {p.level.label} · {plural(p.visitCount, 'visit')}
                          </small>
                        </span>
                        {dist(p) && <span className="row-meta">{dist(p)}</span>}
                      </button>
                    </Stagger>
                  ))}
                </ul>
              </section>
            )}

            {results.length > 0 && (
              <section>
                <div className="list-label">{category ? `${category.label} near you` : 'Places'}</div>
                <ul className="rows">{results.map((r, idx) => resultRow(r, idx, category?.color))}</ul>
              </section>
            )}

            {category && loading && results.length === 0 && (
              <ul className="rows" aria-label="Loading">
                {[0, 1, 2, 3].map((k) => (
                  <li key={k} className="row skeleton">
                    <span className="sk-tile" />
                    <span className="row-text">
                      <span className="sk-line" style={{ width: `${70 - k * 10}%` }} />
                      <span className="sk-line short" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!loading && !error && (q.length >= 2 || category) && savedMatches.length === 0 && results.length === 0 && (
              <p className="search-hint">{category ? `No ${category.label.toLowerCase()} spots found nearby.` : `No places match “${q}”.`}</p>
            )}
            {error && <p className="search-hint">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
