import { Footprints, X } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useMemo, useState } from 'react'
import { usePhotoUrls, useVisitThumbs, type PlaceWithStats } from '../hooks/useData'
import type { Visit } from '../lib/db'
import { dayLabel, duration, shortDate, startOfDay, steps as fmtSteps, timeOfDay } from '../lib/format'
import { PERIOD_OPTIONS, periodStart, type Period } from '../lib/periods'
import { deleteVisit } from '../lib/places'
import { CountUp, EmptyState, IconTile, Segmented, Stagger } from '../ui/bits'
import { useConfirm } from '../ui/Confirm'
import { categoryIcon } from '../ui/icons'
import { PhotoStrip, PhotoViewer } from '../ui/Photos'

interface Props {
  visits: Visit[]
  places: PlaceWithStats[]
  period: Period
  onPeriod(period: Period): void
  /** Open one visit (note, photos). */
  onVisit(visitId: string): void
}

/** Where you've been, day by day. Lives in the You sheet; streak, heatmap and recaps are under "Your map". */
export default function JournalBody({ visits, places, period, onPeriod, onVisit }: Props) {
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
    <>
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
    </>
  )
}

/** Full-size photos for one visit, loaded only when you open them. */
function VisitPhotos({ visit, start, onClose }: { visit: Visit; start: number; onClose(): void }) {
  const photos = usePhotoUrls(visit.id)
  if (!photos.length) return null
  const items = photos.map(({ photo, url }) => ({ id: photo.id, url, label: shortDate(visit.arrivedAt) }))
  return <PhotoViewer items={items} start={start} onClose={onClose} />
}
