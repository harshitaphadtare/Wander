import { Beer, Coffee, Footprints, Navigation, Plus, RotateCw, Tag, UtensilsCrossed, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type CSSProperties } from 'react'
import type { WalkPlanner, WalkTarget } from '../hooks/useWalkPlanner'
import { duration, timeOfDay } from '../lib/format'
import { formatDistance } from '../lib/geo'
import { prettyCategory } from '../lib/photon'
import type { Stop, StopGroup, StopStatus } from '../lib/stops'
import { IconTile, Segmented, Stagger } from '../ui/bits'
import { categoryIcon } from '../ui/icons'
import Sheet from '../ui/Sheet'
import WalkTiming from './WalkTiming'

type Filter = 'all' | StopGroup

export const GROUP_COLOR: Record<StopGroup, string> = { coffee: '#A0612F', food: '#E0573A', drinks: '#7357F6' }
const CLOSED_COLOR = '#A8A29E'

export function stopColor(s: Pick<Stop, 'group' | 'status'>) {
  return s.status === 'closed' ? CLOSED_COLOR : GROUP_COLOR[s.group]
}

const STATUS_CLASS: Record<StopStatus, string> = { open: 'ok', closing: 'warn', closed: 'off', unknown: 'muted' }

interface Props {
  target: WalkTarget
  planner: WalkPlanner
  onStart(): void
  onClose(): void
}

export default function WalkSheet({ target, planner, onStart, onClose }: Props) {
  const { route, base, stops, stop, setStop, arriveAt, routeError, stopsError, hoursStatus, retry, extraS, viaLoading } = planner
  const [filter, setFilter] = useState<Filter>('all')

  const visible = useMemo(() => (stops ?? []).filter((s) => filter === 'all' || s.group === filter), [stops, filter])
  const counts = useMemo(() => {
    const c = { coffee: 0, food: 0, drinks: 0 }
    for (const s of stops ?? []) c[s.group]++
    return c
  }, [stops])

  return (
    <Sheet
      onClose={onClose}
      eyebrow="Walking from your location"
      title={target.name}
      footer={
        <motion.button className="btn primary grow" style={{ width: '100%' }} onClick={onStart} disabled={!route || viaLoading} whileTap={{ scale: 0.97 }}>
          <Navigation size={18} strokeWidth={2.4} /> {stop ? `Start walk via ${stop.name}` : 'Start walk'}
        </motion.button>
      }
    >
      {/* Summary */}
      {routeError ? (
        <div className="error-card">
          <p>{routeError}</p>
          <button className="btn small" onClick={retry}>
            <RotateCw size={15} strokeWidth={2.4} /> Try again
          </button>
        </div>
      ) : (
        <div className="walk-summary">
          <IconTile icon={Footprints} color="var(--accent)" size={48} />
          {route ? (
            <motion.div key={`${route.durationS}`} className="walk-summary-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <strong className="display">{duration(route.durationS * 1000)}</strong>
              <span>
                {formatDistance(route.distanceM)} · arrive {arriveAt && timeOfDay(arriveAt.getTime())}
              </span>
            </motion.div>
          ) : (
            <div className="walk-summary-text">
              <span className="sk-line" style={{ width: 90, height: 28 }} />
              <span className="sk-line" style={{ width: 150 }} />
            </div>
          )}
        </div>
      )}

      {/* Departure time drives "open when you get there"; "arrive by" works it out backwards */}
      <WalkTiming planner={planner} at={target} />

      {/* Chosen stop */}
      <AnimatePresence initial={false}>
        {stop && (
          <motion.div
            className="chosen-stop"
            style={{ '--c': stopColor(stop) } as CSSProperties}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="chosen-stop-inner">
              <IconTile icon={categoryIcon(stop.category)} color={stopColor(stop)} size={40} />
              <span className="row-text">
                <small className="eyebrow">Stopping at</small>
                <strong>{stop.name}</strong>
                <small>{viaLoading ? 'Reshaping your route…' : extraS !== null ? `Adds ${duration(Math.max(60_000, extraS * 1000))} · ${stop.statusText}` : stop.statusText}</small>
              </span>
              <button className="icon-btn" onClick={() => setStop(null)} aria-label="Remove stop">
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stops along the way */}
      {base && (
        <section className="stops">
          <div className="list-label">Stop on the way</div>
          {stopsError ? (
            <div className="error-card">
              <p>{stopsError}</p>
              <button className="btn small" onClick={retry}>
                <RotateCw size={15} strokeWidth={2.4} /> Try again
              </button>
            </div>
          ) : stops === null ? (
            <ul className="rows">
              {[0, 1, 2].map((k) => (
                <li key={k} className="row skeleton">
                  <span className="sk-tile" />
                  <span className="row-text">
                    <span className="sk-line" style={{ width: `${65 - k * 12}%` }} />
                    <span className="sk-line short" />
                  </span>
                </li>
              ))}
            </ul>
          ) : stops.length === 0 ? (
            <p className="body-muted">No cafés or restaurants right on this route. Try a different destination.</p>
          ) : (
            <>
              <Segmented<Filter>
                id="stop-filter"
                value={filter}
                onChange={setFilter}
                options={[
                  ['all', `All ${stops.length}`],
                  ['coffee', `Coffee ${counts.coffee}`],
                  ['food', `Food ${counts.food}`],
                  ['drinks', `Drinks ${counts.drinks}`],
                ]}
              />
              {hoursStatus !== 'ok' && (
                <p className="hours-note">
                  {hoursStatus === 'loading' ? (
                    <>
                      <span className="spinner" /> Checking opening hours…
                    </>
                  ) : (
                    'Opening hours are unavailable right now (the OpenStreetMap service is busy).'
                  )}
                </p>
              )}
              <ul className="rows" key={filter}>
                {visible.map((s, i) => {
                  const chosen = stop?.osmId === s.osmId
                  return (
                    <Stagger key={s.osmId} index={i} className={s.status === 'closed' ? 'is-closed' : undefined}>
                      <button className={`row ${chosen ? 'is-chosen' : ''}`} onClick={() => setStop(chosen ? null : s)}>
                        <IconTile icon={categoryIcon(s.category)} color={stopColor(s)} />
                        <span className="row-text">
                          <strong>{s.name}</strong>
                          <small>
                            <span className="detour">+{Math.max(1, Math.round(s.detourS / 60))} min</span> ·{' '}
                            <span className={`hours ${STATUS_CLASS[s.status]}`}>{s.statusText}</span>
                          </small>
                          <small className="row-sub">
                            {[s.cuisine && prettyCategory(s.cuisine), `you'd pass ~${timeOfDay(s.passAt.getTime())}`].filter(Boolean).join(' · ')}
                          </small>
                        </span>
                        <span className={`stop-add ${chosen ? 'is-on' : ''}`} aria-hidden>
                          {chosen ? <X size={15} strokeWidth={2.6} /> : <Plus size={16} strokeWidth={2.6} />}
                        </span>
                      </button>
                    </Stagger>
                  )
                })}
              </ul>
              {visible.length === 0 && (
                <p className="body-muted">
                  Nothing in this category along the route.{' '}
                  {filter === 'coffee' ? <Coffee size={14} /> : filter === 'food' ? <UtensilsCrossed size={14} /> : <Beer size={14} />}
                </p>
              )}
              <p className="eatclub-line">
                <Tag size={14} strokeWidth={2.4} /> Eating out? Check EatClub for a deal before you go.
              </p>
            </>
          )}
        </section>
      )}
    </Sheet>
  )
}
