import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUpRight, Camera, ImagePlus, Trash, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePhotoUrls, type PlaceWithStats } from '../hooks/useData'
import { db } from '../lib/db'
import { dayLabel, duration, timeOfDay } from '../lib/format'
import { addPhotos, removePhoto } from '../lib/photos'
import { deleteVisit, setVisitNote } from '../lib/places'
import { IconTile } from '../ui/bits'
import { useConfirm } from '../ui/Confirm'
import { categoryIcon } from '../ui/icons'
import Sheet from '../ui/Sheet'

interface Props {
  visitId: string
  place: PlaceWithStats
  onOpenPlace(): void
  notify(text: string, tone?: 'info' | 'success' | 'error'): void
  onClose(): void
}

const MAX_NOTE = 280

/** One check-in as a memory: a line about it and a few photos (photos stay on this device). */
export default function VisitSheet({ visitId, place, onOpenPlace, notify, onClose }: Props) {
  const confirm = useConfirm()
  const visit = useLiveQuery(() => db.visits.get(visitId), [visitId])
  const photos = usePhotoUrls(visitId)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Start from the saved note once it loads; after that the field is yours.
  const value = note ?? visit?.note ?? ''
  const dirty = note !== null && note.trim() !== (visit?.note ?? '')

  // Save as you go (debounced), so closing the sheet never loses a note.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => void setVisitNote(visitId, note!), 600)
    return () => clearTimeout(t)
  }, [note, dirty, visitId])

  // …and flush immediately when the sheet closes mid-typing.
  const latest = useRef({ note, dirty })
  latest.current = { note, dirty }
  useEffect(
    () => () => {
      if (latest.current.dirty) void setVisitNote(visitId, latest.current.note!)
    },
    [visitId],
  )

  if (!visit) return null

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

  const viewed = photos.find((p) => p.photo.id === viewing)

  return (
    <Sheet
      onClose={onClose}
      leading={<IconTile icon={categoryIcon(place.category)} color={place.level.color} size={48} />}
      eyebrow={`${dayLabel(visit.arrivedAt)} · ${timeOfDay(visit.arrivedAt)}${visit.leftAt ? ` · ${duration(visit.leftAt - visit.arrivedAt)}` : ''}`}
      title={place.name}
      footer={
        <div className="btn-row">
          <motion.button className="btn square" onClick={remove} whileTap={{ scale: 0.94 }} aria-label="Delete visit">
            <Trash size={18} strokeWidth={2.2} />
          </motion.button>
          <motion.button className="btn grow" onClick={onOpenPlace} whileTap={{ scale: 0.97 }}>
            Open place <ArrowUpRight size={17} strokeWidth={2.3} />
          </motion.button>
        </div>
      }
    >
      <label className="memo">
        <span className="list-label">Note</span>
        <textarea
          value={value}
          maxLength={MAX_NOTE}
          rows={3}
          placeholder="Got the pistachio croissant…"
          onChange={(e) => setNote(e.target.value)}
        />
        <AnimatePresence>
          {value.length > MAX_NOTE - 60 && (
            <motion.small className="memo-count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {MAX_NOTE - value.length} left
            </motion.small>
          )}
        </AnimatePresence>
      </label>

      <section>
        <div className="list-label">Photos</div>
        <div className="photo-grid">
          {photos.map(({ photo, url }, i) => (
            <motion.button
              key={photo.id}
              className="photo-thumb"
              onClick={() => setViewing(photo.id)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              layoutId={`photo-${photo.id}`}
            >
              <img src={url} alt="" />
            </motion.button>
          ))}
          <motion.button className="photo-add" onClick={() => input.current?.click()} disabled={busy} whileTap={{ scale: 0.95 }}>
            {busy ? <span className="spinner" /> : photos.length ? <ImagePlus size={22} strokeWidth={2} /> : <Camera size={22} strokeWidth={2} />}
            <small>{photos.length ? 'Add' : 'Add photo'}</small>
          </motion.button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </div>
        <p className="group-footer">Photos stay on this device. They’re resized to save space and never uploaded.</p>
      </section>

      {createPortal(
      <AnimatePresence>
        {viewed && (
          <motion.div className="photo-viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewing(null)}>
            <motion.img src={viewed.url} alt="" layoutId={`photo-${viewed.photo.id}`} />
            <div className="photo-viewer-bar" onClick={(e) => e.stopPropagation()}>
              <button
                className="icon-btn"
                aria-label="Delete photo"
                onClick={async () => {
                  await removePhoto(viewed.photo)
                  setViewing(null)
                }}
              >
                <Trash size={16} />
              </button>
              <button className="icon-btn" aria-label="Close photo" onClick={() => setViewing(null)}>
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body,
      )}
    </Sheet>
  )
}
