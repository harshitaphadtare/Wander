import { ChevronRight, Flame, Footprints, Gift, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { usePhotoUrls, useVisitThumbs, type PlaceWithStats } from '../hooks/useData'
import type { Visit } from '../lib/db'
import { dayLabel, duration, shortDate, startOfDay, steps as fmtSteps, timeOfDay } from '../lib/format'
import { PERIOD_OPTIONS, periodStart, type Period } from '../lib/periods'
import { weeklyStreak } from '../lib/streak'
import { deleteVisit } from '../lib/places'
import { CountUp, EmptyState, IconTile, Segmented, Stagger } from '../ui/bits'
import { useConfirm } from '../ui/Confirm'
import { categoryIcon } from '../ui/icons'
import { PhotoStrip, PhotoViewer } from '../ui/Photos'
import Sheet from '../ui/Sheet'

interface Props {
  visits: Visit[]
  places: PlaceWithStats[]
  period: Period
  onPeriod(period: Period): void
  /** Show this period's visits as a heatmap on the map. */
  onHeatmap(): void
  /** Open one visit (note, photos). */
  onVisit(visitId: string): void
  onWrapped(): void
  onClose(): void
}

export default function JournalPanel({ visits, places, period, onPeriod, onHeatmap, onVisit, onWrapped, onClose }: Props) {
  const confirm = useConfirm()
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])

  const { inPeriod, groups, newPlaces } = useMemo(() => {
    const from = periodStart(period)
    const inPeriod = visits.filter((v) => v.arrivedAt >= from && byId.has(v.placeId))

    // A place is "new" this period if its first-ever visit falls inside it.
    const firstVisit = new Map<string, number>()
    for (const v of visits) firstVisit.set(v.placeId, Math.min(firstVisit.get(v.placeId) ?? Infinity, v.arrivedAt))
    const newPlaces = [...firstVisit.entries()].filter(([id, t]) => t >= from && byId.has(id)).length

    const groups: { day: number; visits: Visit[] }[] = []
    for (const v of inPeriod) {
      const day = startOfDay(v.arrivedAt)
      const last = groups.at(-1)
      if (last?.day === day) last.visits.push(v)
      else groups.push({ day, visits: [v] })
    }
    return { inPeriod, groups, newPlaces }
  }, [visits, period, byId])

  const uniquePlaces = new Set(inPeriod.map((v) => v.placeId)).size
  const periodSteps = inPeriod.reduce((sum, v) => sum + (v.steps ?? 0), 0)
  const thumbs = useVisitThumbs(useMemo(() => inPeriod.filter((v) => v.photoIds?.length).map((v) => v.id), [inPeriod]))
  const [viewing, setViewing] = useState<{ visitId: string; index: number } | null>(null)
  const streak = useMemo(() => weeklyStreak(visits), [visits])
  let i = 0

  const remove = async (v: Visit, name: string) => {
    const ok = await confirm({
      title: 'Delete this visit?',
      message: `${name}, ${dayLabel(v.arrivedAt).toLowerCase()} at ${timeOfDay(v.arrivedAt)}.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) await deleteVisit(v.id)
  }

  return (
    <Sheet onClose={onClose} eyebrow="Where you've been" title="Journal">
      <Segmented<Period> id="journal-period" value={period} onChange={onPeriod} options={PERIOD_OPTIONS} />

      <div className="stat-cards">
        <div className="stat-card">
          <strong className="display num">
            <CountUp value={inPeriod.length} />
          </strong>
          <small>Visits</small>
        </div>
        <div className="stat-card">
          <strong className="display num">
            <CountUp value={uniquePlaces} />
          </strong>
          <small>Places</small>
        </div>
        <div className="stat-card accent">
          <strong className="display num">
            <CountUp value={newPlaces} />
          </strong>
          <small>New spots</small>
        </div>
      </div>

      {periodSteps > 0 && (
        <div className="steps-total">
          <Footprints size={16} strokeWidth={2.3} />
          <span>
            <strong>{fmtSteps(periodSteps)}</strong> steps {period === 'all' ? 'logged' : `this ${period}`}
          </span>
        </div>
      )}

      {visits.length > 0 && (
        <motion.div className="streak-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="streak-main">
            <strong className="display num">
              <CountUp value={streak.weeks} />
            </strong>
            <span className="row-text">
              <strong>{streak.weeks === 1 ? 'week' : 'weeks'} of somewhere new</strong>
              <small>
                {streak.thisWeek
                  ? 'This week’s done. Nice.'
                  : streak.weeks
                    ? 'Visit one new place this week to keep it going.'
                    : 'Visit a new place this week to start a streak.'}
                {streak.best > streak.weeks ? ` Best: ${streak.best}.` : ''}
              </small>
            </span>
          </div>
          <div className="streak-weeks" aria-label="Last 8 weeks">
            {streak.recent.map((on, i) => (
              <motion.span
                key={i}
                className={`${on ? 'on' : ''} ${i === 7 ? 'now' : ''}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1 + i * 0.03, type: 'spring', stiffness: 500, damping: 26 }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {visits.length > 0 && (
        <motion.button className="heat-link wrapped-link" onClick={onWrapped} whileTap={{ scale: 0.98 }}>
          <span className="heat-link-icon" aria-hidden>
            <Gift size={18} strokeWidth={2.3} />
          </span>
          <span className="row-text">
            <strong>Wander Wrapped</strong>
            <small>Your {period === 'year' || period === 'all' ? 'year' : 'month'} in places</small>
          </span>
          <ChevronRight size={18} strokeWidth={2.2} aria-hidden />
        </motion.button>
      )}

      {inPeriod.length > 0 && (
        <motion.button className="heat-link" onClick={onHeatmap} whileTap={{ scale: 0.98 }}>
          <span className="heat-link-icon" aria-hidden>
            <Flame size={18} strokeWidth={2.3} />
          </span>
          <span className="row-text">
            <strong>See your heatmap</strong>
            <small>Where you spent time {period === 'all' ? 'overall' : `this ${period}`}</small>
          </span>
          <ChevronRight size={18} strokeWidth={2.2} aria-hidden />
        </motion.button>
      )}

      {groups.length === 0 ? (
        <EmptyState icon={Footprints} title="A blank page">
          No visits {period === 'all' ? 'yet' : `this ${period}`}. Go wander, and check in when you find somewhere good.
        </EmptyState>
      ) : (
        <div key={period}>
          {groups.map((g) => (
            <section key={g.day} className="day">
              <h3 className="day-label">
                {dayLabel(g.day)}
                <span>
                  {g.visits.length} {g.visits.length === 1 ? 'visit' : 'visits'}
                </span>
              </h3>
              <ul className="timeline">
                {g.visits.map((v) => {
                  const place = byId.get(v.placeId)!
                  return (
                    <Stagger key={v.id} index={i++} className="timeline-item">
                      <span className="timeline-node" style={{ background: place.level.color }} />
                      <div
                        className="timeline-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => onVisit(v.id)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onVisit(v.id))}
                      >
                        <div className="timeline-head">
                          <IconTile icon={categoryIcon(place.category)} color={place.level.color} size={36} />
                          <span className="row-text">
                            <strong>{place.name}</strong>
                            <small>
                              {v.source === 'auto' ? 'Auto-detected' : 'Checked in'}
                              {v.leftAt ? ` · ${duration(v.leftAt - v.arrivedAt)}` : ''}
                              {v.steps ? ` · ${fmtSteps(v.steps)} steps` : ''}
                            </small>
                          </span>
                          <time className="timeline-time" dateTime={new Date(v.arrivedAt).toISOString()}>
                            {timeOfDay(v.arrivedAt)}
                          </time>
                          <button
                            className="timeline-delete"
                            aria-label="Delete visit"
                            onClick={(e) => {
                              e.stopPropagation()
                              void remove(v, place.name)
                            }}
                          >
                            <X size={14} strokeWidth={2.4} />
                          </button>
                        </div>
                        {v.note && <p className="timeline-note">“{v.note}”</p>}
                        {thumbs.get(v.id) && (
                          <PhotoStrip items={thumbs.get(v.id)!} onOpen={(index) => setViewing({ visitId: v.id, index })} />
                        )}
                      </div>
                    </Stagger>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <AnimatePresence>
        {viewing && (
          <VisitPhotos
            key="viewer"
            visit={visits.find((v) => v.id === viewing.visitId)!}
            start={viewing.index}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>
    </Sheet>
  )
}

/** Full-size photos for one visit, loaded only when you open them. */
function VisitPhotos({ visit, start, onClose }: { visit: Visit; start: number; onClose(): void }) {
  const photos = usePhotoUrls(visit.id)
  if (!photos.length) return null
  const items = photos.map(({ photo, url }) => ({ id: photo.id, url, label: shortDate(visit.arrivedAt) }))
  return <PhotoViewer items={items} start={start} onClose={onClose} />
}
