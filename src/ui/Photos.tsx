import { ChevronLeft, ChevronRight, Trash, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface PhotoItem {
  id: string
  url: string
  /** e.g. "Sun 5 Oct" */
  label?: string
}

/** Which slide of a horizontal scroll-snap rail is showing. */
function useActiveSlide(rail: React.RefObject<HTMLDivElement | null>) {
  const [index, setIndex] = useState(0)
  const onScroll = () => {
    const el = rail.current
    if (!el) return
    setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
  }
  return [index, onScroll] as const
}

/** Swipeable photos with a date tag, a counter and dots. Tap one to open it full screen. */
export function PhotoCarousel({ items, onOpen }: { items: PhotoItem[]; onOpen(index: number): void }) {
  const rail = useRef<HTMLDivElement>(null)
  const [index, onScroll] = useActiveSlide(rail)
  if (!items.length) return null
  return (
    <div className="carousel">
      <div className="carousel-rail" ref={rail} onScroll={onScroll}>
        {items.map((p, i) => (
          <button key={p.id} className="carousel-slide" onClick={() => onOpen(i)} aria-label={`Open photo ${i + 1} of ${items.length}`}>
            <img src={p.url} alt="" loading={i > 1 ? 'lazy' : undefined} draggable={false} />
            {p.label && <span className="carousel-date">{p.label}</span>}
          </button>
        ))}
      </div>
      {items.length > 1 && (
        <>
          <span className="carousel-count">
            {index + 1} / {items.length}
          </span>
          <div className="carousel-dots" aria-hidden>
            {items.slice(0, 12).map((p, i) => (
              <span key={p.id} className={i === Math.min(index, 11) ? 'on' : ''} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** A row of small square thumbnails ("+3" on the last one when there are more). */
export function PhotoStrip({ items, max = 4, onOpen }: { items: PhotoItem[]; max?: number; onOpen(index: number): void }) {
  const shown = items.slice(0, max)
  const more = items.length - shown.length
  return (
    <div className="photo-strip">
      {shown.map((p, i) => (
        <button
          key={p.id}
          className="photo-strip-item"
          onClick={(e) => {
            e.stopPropagation()
            onOpen(i)
          }}
          aria-label={`Open photo ${i + 1}`}
        >
          <img src={p.url} alt="" loading="lazy" draggable={false} />
          {more > 0 && i === shown.length - 1 && <span className="photo-strip-more">+{more}</span>}
        </button>
      ))}
    </div>
  )
}

/** Full-screen, swipeable photo viewer. */
export function PhotoViewer({
  items,
  start,
  onClose,
  onDelete,
}: {
  items: PhotoItem[]
  start: number
  onClose(): void
  onDelete?(item: PhotoItem): void
}) {
  const rail = useRef<HTMLDivElement>(null)
  const [index, onScroll] = useActiveSlide(rail)

  useEffect(() => {
    const el = rail.current
    if (el) el.scrollLeft = start * el.clientWidth
  }, [start])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const go = (by: number) => {
    const el = rail.current
    if (el) el.scrollBy({ left: by * el.clientWidth, behavior: 'smooth' })
  }

  const current = items[Math.min(index, items.length - 1)]
  return createPortal(
    <motion.div className="viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <div className="viewer-bar">
        <span className="viewer-meta">
          {current?.label && <strong>{current.label}</strong>}
          {items.length > 1 && (
            <small>
              {index + 1} of {items.length}
            </small>
          )}
        </span>
        {onDelete && current && (
          <button className="viewer-btn" aria-label="Delete photo" onClick={() => onDelete(current)}>
            <Trash size={17} />
          </button>
        )}
        <button className="viewer-btn" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="viewer-rail" ref={rail} onScroll={onScroll}>
        {items.map((p) => (
          <div key={p.id} className="viewer-slide" onClick={onClose}>
            <motion.img
              src={p.url}
              alt=""
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <>
          <button className="viewer-nav prev" aria-label="Previous photo" onClick={() => go(-1)} disabled={index === 0}>
            <ChevronLeft size={22} />
          </button>
          <button className="viewer-nav next" aria-label="Next photo" onClick={() => go(1)} disabled={index >= items.length - 1}>
            <ChevronRight size={22} />
          </button>
        </>
      )}
    </motion.div>,
    document.body,
  )
}

/** Open/close state for a viewer, wrapped in AnimatePresence by the caller. */
export function useViewer() {
  const [open, setOpen] = useState<number | null>(null)
  return { open, show: setOpen, hide: () => setOpen(null) }
}

export { AnimatePresence as ViewerPresence }
