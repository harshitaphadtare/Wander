import { Clock, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import { plural } from '../lib/format'
import { distanceM, formatDistance, type LatLng } from '../lib/geo'
import { prettyCategory, searchPlaces, type PhotonPlace } from '../lib/photon'
import { IconTile, Stagger } from '../ui/bits'
import { categoryIcon, LEVEL_ICONS } from '../ui/icons'

/*
 * Search is just for searching: your places first, then everywhere else.
 * Browsing by mood ("coffee nearby", "somewhere new") lives in Explore.
 */

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
}

export default function SearchBar({ places, near, from, onPickSaved, onPickResult }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(false)
  const [results, setResults] = useState<PhotonPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recents, setRecents] = useState<PhotonPlace[]>(loadRecents)
  const input = useRef<HTMLInputElement>(null)

  const q = query.trim()

  const savedMatches = useMemo(() => {
    if (!q) return [...places].sort((a, b) => b.visitCount - a.visitCount).slice(0, 4)
    const needle = q.toLowerCase()
    return places.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 4)
  }, [places, q])

  // Debounced search; abort stale requests.
  useEffect(() => {
    if (q.length < 2) {
      setResults([])
      setError(null)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const found = await searchPlaces(q, near() ?? undefined, ctrl.signal)
        const savedOsm = new Set(places.map((p) => p.osmId).filter(Boolean))
        setResults(found.filter((r) => !r.osmId || !savedOsm.has(r.osmId)))
        setError(null)
      } catch (err) {
        if ((err as Error).name !== 'AbortError')
          setError(navigator.onLine ? 'Search is unavailable right now.' : "You're offline. Showing your places only.")
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
    // `near` and `places` are read at call time on purpose; re-search only when the text changes.
  }, [q])

  const close = () => {
    input.current?.blur()
    setActive(false)
    setQuery('')
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

  const dist = (p: LatLng) => (from ? formatDistance(distanceM(from, p)) : null)
  let i = 0

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
          <Search size={18} strokeWidth={2.3} className="search-icon" />
          <input
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search places"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
          {active && (
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
              if ((e.target as HTMLElement).closest('button')) e.preventDefault()
            }}
          >
            {!q && recents.length > 0 && (
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
                <div className="list-label">Places</div>
                <ul className="rows">
                  {results.map((r, idx) => (
                    <Stagger key={r.osmId ?? `${r.lat},${r.lng},${idx}`} index={i++}>
                      <button className="row" onClick={() => pickResult(r)}>
                        <IconTile icon={categoryIcon(r.category)} color="var(--ink-2)" />
                        <span className="row-text">
                          <strong>{r.name}</strong>
                          <small>{[prettyCategory(r.category), r.address].filter(Boolean).join(' · ')}</small>
                        </span>
                        {dist(r) && <span className="row-meta">{dist(r)}</span>}
                      </button>
                    </Stagger>
                  ))}
                </ul>
              </section>
            )}

            {!q && !recents.length && !savedMatches.length && (
              <p className="search-hint">Search for a café, park, beach or suburb. For ideas, try Explore.</p>
            )}
            {!loading && !error && q.length >= 2 && savedMatches.length === 0 && results.length === 0 && (
              <p className="search-hint">No places match “{q}”.</p>
            )}
            {error && <p className="search-hint">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
