import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUpRight, Camera, Check, CloudOff, CloudUpload, Footprints, ImagePlus, Minus, PenLine, Plus, RefreshCw, Trash } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePhotoUrls, type PlaceWithStats } from '../hooks/useData'
import { db } from '../lib/db'
import { dayLabel, duration, shortDate, steps as fmtSteps, timeOfDay } from '../lib/format'
import { addPhotos, removePhoto } from '../lib/photos'
import { deleteVisit, setVisitNote, setVisitSteps } from '../lib/places'
import { syncNow, syncStore } from '../lib/sync'
import { IconTile } from '../ui/bits'
import { useConfirm } from '../ui/Confirm'
import { categoryIcon } from '../ui/icons'
import { PhotoCarousel, PhotoViewer, type PhotoItem } from '../ui/Photos'
import Sheet from '../ui/Sheet'

interface Props {
  visitId: string
  place: PlaceWithStats
  /** Just checked in: lead with the three things worth adding and end with "Done". */
  fresh?: boolean
  onOpenPlace(): void
  notify(text: string, tone?: 'info' | 'success' | 'error'): void
  onClose(): void
}

const MAX_NOTE = 1000

/** A textarea that grows with what you write instead of cutting it off. */
function useAutosize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px` // include the border
  }, [ref, value])
}

/** One check-in as a memory: a note, your steps, and photos (backed up encrypted when you're signed in). */
export default function VisitSheet({ visitId, place, fresh = false, onOpenPlace, notify, onClose }: Props) {
  const confirm = useConfirm()
  const visit = useLiveQuery(() => db.visits.get(visitId), [visitId])
  const photos = usePhotoUrls(visitId)
  const sync = useSyncExternalStore(syncStore.subscribe, syncStore.get)
  const [note, setNote] = useState<string | null>(null)
  const [stepsDraft, setStepsDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const stepsInput = useRef<HTMLInputElement>(null)

  // Start from the saved note once it loads; after that the field is yours.
  const value = note ?? visit?.note ?? ''
  const dirty = note !== null && note.trim() !== (visit?.note ?? '')
  useAutosize(area, value)

  // Save as you go (debounced), so closing the sheet never loses a note.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => void setVisitNote(visitId, note!), 600)
    return () => clearTimeout(t)
  }, [note, dirty, visitId])

  // …and flush immediately when the sheet closes mid-typing.
  const latest = useRef({ note, dirty })
  useEffect(() => {
    latest.current = { note, dirty }
  })
  useEffect(
    () => () => {
      if (latest.current.dirty) void setVisitNote(visitId, latest.current.note!)
    },
    [visitId],
  )

  if (!visit) return null

  const stepsValue = stepsDraft ?? (visit.steps ? String(visit.steps) : '')
  const commitSteps = (raw: string) => {
    const n = Number(raw.replace(/[^\d]/g, ''))
    setStepsDraft(null)
    if ((n || 0) !== (visit.steps ?? 0)) void setVisitSteps(visitId, n || null)
  }
  const bumpSteps = (by: number) => {
    const n = Math.max(0, (visit.steps ?? 0) + by)
    void setVisitSteps(visitId, n || null)
  }

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const n = await addPhotos(visitId, files)
      if (n) notify(n === 1 ? 'Photo added' : `${n} photos added`, 'success')
    } catch (err) {
      notify((err as Error).message || 'Couldn’t add that photo', 'error')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this visit?',
      message: `${place.name}, ${dayLabel(visit.arrivedAt).toLowerCase()} at ${timeOfDay(visit.arrivedAt)}. Its note and photos go too.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    await deleteVisit(visitId)
    onClose()
  }

  const focusField = (el: HTMLElement | null) => {
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  // Photos this visit lists but this device doesn't have yet (added on another device),
  // and photos added here that haven't reached the cloud.
  const local = new Set(photos.map((p) => p.photo.id))
  const arriving = (visit.photoIds ?? []).filter((id) => !local.has(id)).length
  const syncing = sync.status !== 'disabled' && sync.status !== 'signed-out'
  const unsent = syncing ? photos.filter((p) => p.photo.uploaded !== 1).length : 0
  const photoCount = photos.length + arriving

  const hasNote = !!value.trim()
  const memorySteps = [
    {
      key: 'photos',
      icon: Camera,
      label: 'Photos',
      done: photoCount > 0,
      status: arriving ? `${arriving} on the way` : photos.length ? `${photos.length} added` : 'Add',
      act: () => input.current?.click(),
    },
    { key: 'note', icon: PenLine, label: 'Note', done: hasNote, status: hasNote ? 'Written' : 'Write', act: () => focusField(area.current) },
    {
      key: 'steps',
      icon: Footprints,
      label: 'Steps',
      done: !!visit.steps,
      status: visit.steps ? fmtSteps(visit.steps) : 'Log',
      act: () => focusField(stepsInput.current),
    },
  ]
  const doneCount = memorySteps.filter((m) => m.done).length
  // Shown right after a check-in, and on any visit that's still missing something.
  const showGuide = fresh || doneCount < memorySteps.length

  const items: PhotoItem[] = photos.map(({ photo, url }) => ({ id: photo.id, url, label: shortDate(visit.arrivedAt) }))

  return (
    <Sheet
      onClose={onClose}
      leading={<IconTile icon={categoryIcon(place.category)} color={place.level.color} size={48} />}
      eyebrow={`${fresh ? 'Checked in' : dayLabel(visit.arrivedAt)} · ${timeOfDay(visit.arrivedAt)}${visit.leftAt ? ` · ${duration(visit.leftAt - visit.arrivedAt)}` : ''}`}
      title={place.name}
      footer={
        <div className="btn-row">
          <motion.button className="btn square" onClick={remove} whileTap={{ scale: 0.94 }} aria-label="Delete visit">
            <Trash size={18} strokeWidth={2.2} />
          </motion.button>
          <motion.button className="btn grow" onClick={onOpenPlace} whileTap={{ scale: 0.97 }}>
            {fresh ? 'View place' : 'Open place'} <ArrowUpRight size={17} strokeWidth={2.3} />
          </motion.button>
          {fresh && (
            <motion.button className="btn primary grow" onClick={onClose} whileTap={{ scale: 0.97 }}>
              <Check size={18} strokeWidth={2.6} /> Done
            </motion.button>
          )}
        </div>
      }
    >
      {showGuide && (
        <section className="memory-guide" aria-label="Make this visit a memory">
          <div className="memory-guide-head">
            <strong>{fresh && doneCount === 0 ? 'Make it a memory' : doneCount === memorySteps.length ? 'All set' : 'Add to this visit'}</strong>
            <small>
              {doneCount} of {memorySteps.length}
            </small>
          </div>
          <div className="memory-steps">
            {memorySteps.map((m, i) => {
              const Icon = m.icon
              return (
                <motion.button
                  key={m.key}
                  className={`memory-step ${m.done ? 'is-done' : ''}`}
                  onClick={m.act}
                  disabled={m.key === 'photos' && busy}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i + 0.08, type: 'spring', stiffness: 420, damping: 30 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="memory-step-icon">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {m.key === 'photos' && busy ? (
                        <span key="busy" className="spinner" />
                      ) : m.done ? (
                        <motion.span key="done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
                          <Check size={18} strokeWidth={3} />
                        </motion.span>
                      ) : (
                        <motion.span key="icon" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}>
                          <Icon size={19} strokeWidth={2.2} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <strong>{m.label}</strong>
                  <small>{m.status}</small>
                </motion.button>
              )
            })}
          </div>
        </section>
      )}

      {(arriving > 0 || unsent > 0) && (
        <div className={`photo-sync ${sync.status === 'error' ? 'is-error' : ''}`}>
          {sync.status === 'error' ? <CloudOff size={17} strokeWidth={2.2} /> : <CloudUpload size={17} strokeWidth={2.2} />}
          <span>
            <strong>
              {arriving > 0
                ? `${arriving === 1 ? '1 photo hasn’t' : `${arriving} photos haven’t`} arrived from your other device`
                : `${unsent === 1 ? '1 photo isn’t' : `${unsent} photos aren’t`} backed up yet`}
            </strong>
            <small>
              {sync.status === 'error'
                ? sync.error
                : sync.status === 'offline'
                  ? 'You’re offline. They’ll sync when you’re back online.'
                  : arriving > 0
                    ? 'Open Wander on the device you took them on, so it can finish uploading.'
                    : 'Keep Wander open for a moment while they upload.'}
            </small>
          </span>
          <button className="icon-btn" onClick={() => void syncNow()} disabled={sync.status === 'syncing'} aria-label="Sync now">
            <RefreshCw size={15} className={sync.status === 'syncing' ? 'spin' : ''} />
          </button>
        </div>
      )}

      {/* Photos first: they're the memory. */}
      <section className="visit-photos">
        {items.length ? (
          <>
            <PhotoCarousel items={items} onOpen={setViewing} />
            <button className="photo-add-row" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <span className="spinner" /> : <ImagePlus size={17} strokeWidth={2.2} />}
              Add more photos
            </button>
          </>
        ) : arriving > 0 ? (
          <button className="photo-add-row" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <span className="spinner" /> : <ImagePlus size={17} strokeWidth={2.2} />}
            Add more photos
          </button>
        ) : (
          !showGuide && (
            <motion.button className="photo-add-hero" onClick={() => input.current?.click()} disabled={busy} whileTap={{ scale: 0.98 }}>
              {busy ? <span className="spinner" /> : <Camera size={24} strokeWidth={2} />}
              <strong>Add photos</strong>
              <small>They show up on the map pin and in your journal.</small>
            </motion.button>
          )
        )}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </section>

      <label className="memo">
        <span className="list-label">Note</span>
        <textarea
          ref={area}
          value={value}
          maxLength={MAX_NOTE}
          rows={2}
          placeholder="What happened here? Got the pistachio croissant…"
          onChange={(e) => setNote(e.target.value)}
        />
        <AnimatePresence>
          {value.length > MAX_NOTE - 80 && (
            <motion.small className="memo-count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {MAX_NOTE - value.length} left
            </motion.small>
          )}
        </AnimatePresence>
      </label>

      <section className="steps-field">
        <span className="list-label">Steps</span>
        <div className="steps-row">
          <span className="steps-icon" aria-hidden>
            <Footprints size={18} strokeWidth={2.2} />
          </span>
          <input
            ref={stepsInput}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="How many steps?"
            aria-label="Steps"
            value={stepsDraft ?? (stepsValue ? fmtSteps(Number(stepsValue)) : '')}
            onChange={(e) => setStepsDraft(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={(e) => commitSteps(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <button className="icon-btn" aria-label="1,000 fewer steps" onClick={() => bumpSteps(-1000)} disabled={!visit.steps}>
            <Minus size={15} />
          </button>
          <button className="icon-btn" aria-label="1,000 more steps" onClick={() => bumpSteps(1000)}>
            <Plus size={15} />
          </button>
        </div>
        <div className="steps-quick">
          {[2000, 5000, 10000].map((n) => (
            <button key={n} className="chip" onClick={() => void setVisitSteps(visitId, n)}>
              {fmtSteps(n)}
            </button>
          ))}
          <small>From your iPhone’s Health app, if you like.</small>
        </div>
      </section>

      <p className="group-footer">Photos are resized to save space. When you’re signed in they’re encrypted on this device, then backed up so your other devices show them too.</p>

      <AnimatePresence>
        {viewing !== null && (
          <PhotoViewer
            key="viewer"
            items={items}
            start={viewing}
            onClose={() => setViewing(null)}
            onDelete={async (item) => {
              const p = photos.find((x) => x.photo.id === item.id)
              if (!p) return
              const ok = await confirm({ title: 'Delete this photo?', message: 'It’s removed from all your devices and can’t be recovered.', confirmLabel: 'Delete', destructive: true })
              if (!ok) return
              await removePhoto(p.photo)
              setViewing(null)
            }}
          />
        )}
      </AnimatePresence>
    </Sheet>
  )
}
