import { ArrowRight, Pencil } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import { distanceM, formatDistance, type LatLng } from '../lib/geo'
import { isAbort, withTimeout } from '../lib/net'
import { prettyCategory, reverseGeocode, type PhotonPlace } from '../lib/photon'
import type { PlaceInput } from '../lib/places'
import { IconTile, Stagger } from '../ui/bits'
import { categoryIcon, LEVEL_ICONS } from '../ui/icons'
import Sheet from '../ui/Sheet'

/** OpenMapTiles poi classes worth checking in at. */
const MAP_CLASSES = ['cafe', 'restaurant', 'fast_food', 'bakery', 'ice_cream', 'bar', 'beer', 'park', 'garden', 'attraction', 'museum', 'art_gallery', 'library', 'shop', 'grocery', 'clothing_store']

/** Real places (cafés, parks…) before streets and addresses; one per name; skip ones you've saved. */
function tidy(found: PhotonPlace[], at: LatLng, places: PlaceWithStats[]): PhotonPlace[] {
  const savedOsm = new Set(places.map((p) => p.osmId).filter(Boolean))
  const savedNames = new Set(places.filter((p) => distanceM(at, p) < 150).map((p) => p.name.toLowerCase()))
  const sorted = [...found].sort((a, b) => Number(!a.category) - Number(!b.category) || distanceM(at, a) - distanceM(at, b))
  const seen = new Set<string>()
  return sorted
    .filter((f) => {
      const key = f.name.toLowerCase()
      if (seen.has(key) || savedNames.has(key) || (f.osmId && savedOsm.has(f.osmId))) return false
      seen.add(key)
      return true
    })
    .slice(0, 6)
}

export type PickChoice = { kind: 'saved'; place: PlaceWithStats } | { kind: 'new'; input: PlaceInput }

interface Props {
  at: LatLng
  accuracy?: number
  mode: 'here' | 'pin'
  places: PlaceWithStats[]
  busy: boolean
  /** Named POIs from the loaded map tiles, shown instantly while the server lookup runs. */
  nearbyFromMap?: (at: LatLng, radiusM: number, classes: string[]) => { osmId: string; name: string; lat: number; lng: number; category: string }[]
  onChoose(choice: PickChoice): void
  onClose(): void
}

/**
 * "Where are you?" picker. Offers your saved places nearby first, then named
 * OpenStreetMap places around the point, then a free-text name.
 */
export default function PickPlaceSheet({ at, accuracy, mode, places, busy, nearbyFromMap, onChoose, onClose }: Props) {
  const radius = Math.max(mode === 'here' ? 100 : 60, Math.min(accuracy ?? 0, 200))
  // The map already knows the cafés and parks around you: show those straight away.
  const [suggestions, setSuggestions] = useState<PhotonPlace[] | null>(() => {
    try {
      const fromMap = (nearbyFromMap?.(at, radius + 40, MAP_CLASSES) ?? []).map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, category: p.category }))
      return fromMap.length ? tidy(fromMap, at, places) : null
    } catch {
      return null
    }
  })
  const [lookupFailed, setLookupFailed] = useState(false)
  const [customName, setCustomName] = useState('')

  const nearbySaved = useMemo(
    () =>
      places
        .map((p) => ({ p, d: distanceM(at, p) }))
        .filter((x) => x.d <= radius)
        .sort((a, b) => a.d - b.d)
        .slice(0, 5),
    [places, at, radius],
  )

  useEffect(() => {
    const ctrl = new AbortController()
    withTimeout(8_000, ctrl.signal, (signal) => reverseGeocode(at, signal))
      .then((found) => setSuggestions((shown) => tidy([...found, ...(shown ?? [])], at, places)))
      .catch((err) => {
        if (ctrl.signal.aborted) return
        // Keep what the map gave us; only say the lookup failed if there's nothing to show.
        setSuggestions((shown) => shown ?? [])
        if (!isAbort(err)) setLookupFailed(true)
      })
    return () => ctrl.abort()
    // The sheet is keyed by point, so this runs once per sheet; `places` is only for de-duplication.
  }, [])

  const verb = mode === 'here' ? 'Check in' : 'Add'
  let i = 0

  return (
    <Sheet
      onClose={onClose}
      eyebrow={
        mode === 'here'
          ? accuracy
            ? `Located within ${formatDistance(accuracy)}`
            : 'Your location'
          : `${at.lat.toFixed(4)}, ${at.lng.toFixed(4)}`
      }
      title={mode === 'here' ? 'Where are you?' : 'Dropped pin'}
    >
      {nearbySaved.length > 0 && (
        <section>
          <div className="list-label">Your places nearby</div>
          <ul className="rows">
            {nearbySaved.map(({ p, d }) => (
              <Stagger key={p.id} index={i++}>
                <button className="row" disabled={busy} onClick={() => onChoose({ kind: 'saved', place: p })}>
                  <IconTile icon={LEVEL_ICONS[p.level.key]} color={p.level.color} />
                  <span className="row-text">
                    <strong>{p.name}</strong>
                    <small>
                      {p.level.label} · {formatDistance(d)}
                    </small>
                  </span>
                  <span className="row-action">{verb}</span>
                </button>
              </Stagger>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="list-label">Around here</div>
        {suggestions === null ? (
          <ul className="rows" aria-label="Loading nearby places">
            {[0, 1, 2].map((k) => (
              <li key={k} className="row skeleton">
                <span className="sk-tile" />
                <span className="row-text">
                  <span className="sk-line" style={{ width: `${60 - k * 10}%` }} />
                  <span className="sk-line short" />
                </span>
              </li>
            ))}
          </ul>
        ) : suggestions.length === 0 ? (
          <p className="body-muted">
            {lookupFailed ? "Couldn't look up nearby places. Are you offline? Name it yourself below." : 'Nothing named nearby. Give it a name below.'}
          </p>
        ) : (
          <ul className="rows">
            {suggestions.map((s) => (
              <Stagger key={s.name.toLowerCase()} index={i++}>
                <button className="row" disabled={busy} onClick={() => onChoose({ kind: 'new', input: s })}>
                  <IconTile icon={categoryIcon(s.category)} color="var(--ink-2)" />
                  <span className="row-text">
                    <strong>{s.name}</strong>
                    <small>{[prettyCategory(s.category), formatDistance(distanceM(at, s))].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="row-action">{verb}</span>
                </button>
              </Stagger>
            ))}
          </ul>
        )}
      </section>

      <form
        className="name-field"
        onSubmit={(e) => {
          e.preventDefault()
          if (!customName.trim()) return
          onChoose({ kind: 'new', input: { name: customName.trim(), lat: at.lat, lng: at.lng } })
        }}
      >
        <Pencil size={16} strokeWidth={2.2} className="name-field-icon" />
        <input
          placeholder="Name this spot yourself"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          enterKeyHint="done"
          aria-label="Custom place name"
        />
        <motion.button
          className="icon-btn accent"
          disabled={busy || !customName.trim()}
          whileTap={{ scale: 0.9 }}
          aria-label={verb}
        >
          <ArrowRight size={17} strokeWidth={2.6} />
        </motion.button>
      </form>
    </Sheet>
  )
}
