import { useLiveQuery } from 'dexie-react-hooks'
import { Bookmark, Camera, Check, ChevronRight, Ellipsis, Footprints, MapPinPlus, Pencil, Tag, Trash } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { usePlacePhotos, type PlaceWithStats } from '../hooks/useData'
import { db, type List } from '../lib/db'
import { plural, relativeTime, shortDate, steps as fmtSteps, timeOfDay } from '../lib/format'
import { distanceM, formatDistance, type LatLng } from '../lib/geo'
import { nextLevel } from '../lib/levels'
import { isFoodPlace, prettyCategory, type PhotonPlace } from '../lib/photon'
import { deletePlace, renamePlace } from '../lib/places'
import { IconTile, ProgressRing } from '../ui/bits'
import { useConfirm } from '../ui/Confirm'
import { categoryIcon, LEVEL_ICONS } from '../ui/icons'
import { PhotoCarousel, PhotoViewer } from '../ui/Photos'
import Sheet from '../ui/Sheet'
import ListChips from './ListChips'

function EatClubNote({ category }: { category?: string }) {
  if (!isFoodPlace(category)) return null
  return (
    <motion.div className="note" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
      <Tag size={16} strokeWidth={2.4} />
      <span>
        <strong>Eating here?</strong> Check EatClub for a deal before you go.
      </span>
    </motion.div>
  )
}

function metaLine(category: string | undefined, from: LatLng | null, at: LatLng) {
  return [prettyCategory(category), from ? `${formatDistance(distanceM(from, at))} away` : null].filter(Boolean).join(' · ')
}

interface SavedProps {
  place: PlaceWithStats
  from: LatLng | null
  lists: List[]
  busy: boolean
  onVisit(visitId: string): void
  onCheckIn(): void
  onWalk(): void
  onClose(): void
  onDeleted(): void
}

export function SavedPlaceSheet({ place, from, lists, busy, onVisit, onCheckIn, onWalk, onClose, onDeleted }: SavedProps) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(place.name)
  const recent = useLiveQuery(
    () =>
      db.visits
        .where('placeId')
        .equals(place.id)
        .filter((v) => !v.deleted)
        .reverse()
        .sortBy('arrivedAt')
        .then((v) => v.slice(0, 6)),
    [place.id],
  )
  const photos = usePlacePhotos(place.id)
  const memories = photos.map((p) => ({ id: p.photo.id, url: p.url, label: shortDate(p.at) }))
  const [viewing, setViewing] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const totalSteps = useLiveQuery(
    () =>
      db.visits
        .where('placeId')
        .equals(place.id)
        .filter((v) => !v.deleted)
        .toArray()
        .then((vs) => vs.reduce((sum, v) => sum + (v.steps ?? 0), 0)),
    [place.id],
  )
  // Today's visit, so coming back to add photos or a note is one tap.
  const today = recent?.[0] && new Date(recent[0].arrivedAt).toDateString() === new Date().toDateString() ? recent[0] : null
  const todayPhotos = useLiveQuery(() => (today ? db.photos.where('visitId').equals(today.id).count() : 0), [today?.id])
  const next = nextLevel(place.visitCount)
  const LevelIcon = LEVEL_ICONS[place.level.key]

  const saveName = async () => {
    await renamePlace(place.id, name)
    setEditing(false)
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${place.name}?`,
      message: place.visitCount
        ? `This deletes the place and its ${plural(place.visitCount, 'visit')} from your journal.`
        : 'This removes it from your places.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    await deletePlace(place.id)
    onDeleted()
  }

  return (
    <Sheet
      onClose={onClose}
      leading={<IconTile icon={categoryIcon(place.category)} color={place.level.color} size={48} />}
      eyebrow={[place.visitCount === 0 ? 'Want to go' : null, metaLine(place.category, from, place)].filter(Boolean).join(' · ') || 'Your place'}
      title={
        editing ? (
          <form
            className="rename"
            onSubmit={(e) => {
              e.preventDefault()
              void saveName()
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Place name" onBlur={saveName} />
            <button className="icon-btn accent" aria-label="Save name">
              <Check size={16} strokeWidth={3} />
            </button>
          </form>
        ) : (
          <button className="title-btn" onClick={() => setEditing(true)} aria-label={`Rename ${place.name}`}>
            {place.name}
            <Pencil size={14} strokeWidth={2.4} className="title-edit" />
          </button>
        )
      }
      subtitle={place.address}
      actions={
        <div className="menu-wrap">
          <motion.button className="icon-btn" onClick={() => setMenu(!menu)} whileTap={{ scale: 0.88 }} aria-label="More" aria-expanded={menu}>
            <Ellipsis size={18} strokeWidth={2.4} />
          </motion.button>
          <AnimatePresence>
            {menu && (
              <motion.div
                className="menu-pop"
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false)
                    setEditing(true)
                  }}
                >
                  <Pencil size={15} strokeWidth={2.3} /> Rename
                </button>
                <button
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setMenu(false)
                    void remove()
                  }}
                >
                  <Trash size={15} strokeWidth={2.3} /> Remove place
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      }
      footer={
        <div className="btn-row">
          <motion.button className="btn grow" onClick={onWalk} disabled={busy} whileTap={{ scale: 0.97 }}>
            <Footprints size={18} strokeWidth={2.3} /> Walk here
          </motion.button>
          <motion.button className="btn primary grow" onClick={onCheckIn} disabled={busy} whileTap={{ scale: 0.97 }}>
            <MapPinPlus size={18} strokeWidth={2.4} /> Check in
          </motion.button>
        </div>
      }
    >
      {today && (
        <motion.button className="today-visit" onClick={() => onVisit(today.id)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.98 }}>
          <IconTile icon={Camera} color="var(--accent)" size={40} />
          <span>
            <strong>Today’s visit · {timeOfDay(today.arrivedAt)}</strong>
            <small>
              {[todayPhotos ? plural(todayPhotos, 'photo') : null, today.note ? 'note' : null, today.steps ? `${fmtSteps(today.steps)} steps` : null]
                .filter(Boolean)
                .join(' · ') || 'Add photos, a note or your steps'}
            </small>
          </span>
          <ChevronRight size={18} strokeWidth={2.3} className="chev" />
        </motion.button>
      )}

      {memories.length > 0 && (
        <section className="place-memories">
          <div className="list-label">
            Memories · {plural(memories.length, 'photo')}
          </div>
          <PhotoCarousel items={memories} onOpen={setViewing} />
        </section>
      )}

      {/* Level, visits and the next level in one line. */}
      <div className="level-line" style={{ '--c': place.level.color } as React.CSSProperties}>
        <ProgressRing value={next ? place.visitCount / next.min : 1} color={next?.color ?? place.level.color} size={46}>
          <LevelIcon size={17} strokeWidth={2.4} color={place.level.color} />
        </ProgressRing>
        <div>
          <strong>
            {place.level.label} · {plural(place.visitCount, 'visit')}
          </strong>
          <small>
            {place.lastVisitAt ? `Last ${relativeTime(place.lastVisitAt)}` : 'Not visited yet'}
            {next ? ` · ${plural(next.min - place.visitCount, 'more visit')} to ${next.label}` : ''}
          </small>
        </div>
      </div>

      {!!totalSteps && (
        <div className="steps-total">
          <Footprints size={16} strokeWidth={2.3} />
          <span>
            <strong>{fmtSteps(totalSteps)}</strong> steps walked here
          </span>
        </div>
      )}

      {/* A deal tip helps when you're deciding whether to go, not on your eighth visit. */}
      {place.visitCount === 0 && <EatClubNote category={place.category} />}

      <ListChips placeId={place.id} listIds={place.listIds ?? []} lists={lists} />

      {recent && recent.length > 0 && (
        <section>
          <div className="list-label">Recent visits</div>
          <ul className="mini-timeline">
            {recent.map((v, i) => (
              <motion.li
                key={v.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i + 0.1 }}
              >
                <button className="mini-row" onClick={() => onVisit(v.id)}>
                  <span className="mini-dot" />
                  <span className="mini-when">{relativeTime(v.arrivedAt)}</span>
                  <span className="mini-meta">
                    {v.note
                      ? `“${v.note}”`
                      : [timeOfDay(v.arrivedAt), v.steps ? `${fmtSteps(v.steps)} steps` : v.source === 'auto' ? 'Auto' : 'Check-in'].join(' · ')}
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      )}
      <AnimatePresence>
        {viewing !== null && <PhotoViewer key="viewer" items={memories} start={viewing} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </Sheet>
  )
}

interface ResultProps {
  result: PhotonPlace
  from: LatLng | null
  busy: boolean
  onCheckIn(): void
  onSave(): void
  onWalk(): void
  onClose(): void
}

export function ResultSheet({ result, from, busy, onCheckIn, onSave, onWalk, onClose }: ResultProps) {
  return (
    <Sheet
      onClose={onClose}
      leading={<IconTile icon={categoryIcon(result.category)} color="var(--ink-2)" size={48} />}
      eyebrow={metaLine(result.category, from, result) || 'Place'}
      title={result.name}
      subtitle={result.address}
      footer={
        <div className="btn-row">
          <motion.button className="btn square" onClick={onSave} disabled={busy} whileTap={{ scale: 0.94 }} aria-label="Add to Want to go">
            <Bookmark size={18} strokeWidth={2.3} />
          </motion.button>
          <motion.button className="btn grow" onClick={onWalk} disabled={busy} whileTap={{ scale: 0.97 }}>
            <Footprints size={18} strokeWidth={2.3} /> Walk here
          </motion.button>
          <motion.button className="btn primary grow" onClick={onCheckIn} disabled={busy} whileTap={{ scale: 0.97 }}>
            <MapPinPlus size={18} strokeWidth={2.4} /> Check in
          </motion.button>
        </div>
      }
    >
      <p className="body-muted">Not in your places yet. Add it to Want to go for later, or check in when you're here.</p>
      <EatClubNote category={result.category} />
    </Sheet>
  )
}
