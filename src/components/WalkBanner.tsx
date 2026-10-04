import { MapPinCheck, Navigation, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ActiveWalk } from '../hooks/useActiveWalk'
import { duration, timeOfDay } from '../lib/format'
import { formatDistance } from '../lib/geo'

interface Props {
  walk: ActiveWalk
  progress: { remainingM: number; remainingS: number; arrived: boolean; offRoute: boolean }
  onCheckIn(): void
  onEnd(): void
}

/** Top banner while walking: time and distance left, then "You've arrived". */
export default function WalkBanner({ walk, progress, onCheckIn, onEnd }: Props) {
  const eta = timeOfDay(Date.now() + progress.remainingS * 1000)
  return (
    <motion.div
      className={`walk-banner ${progress.arrived ? 'is-arrived' : ''}`}
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -30, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      layout
    >
      <span className="walk-banner-icon">
        {progress.arrived ? <MapPinCheck size={20} strokeWidth={2.4} /> : <Navigation size={19} strokeWidth={2.4} />}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        {progress.arrived ? (
          <motion.div key="arrived" className="walk-banner-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <small>You've arrived</small>
            <strong>{walk.target.name}</strong>
          </motion.div>
        ) : (
          <motion.div key="walking" className="walk-banner-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <small>
              {walk.stop ? `Via ${walk.stop.name} · ` : ''}
              {progress.offRoute ? 'Off route' : `Arrive ${eta}`}
            </small>
            <strong>
              {duration(Math.max(60_000, progress.remainingS * 1000))} · {formatDistance(progress.remainingM)}
            </strong>
          </motion.div>
        )}
      </AnimatePresence>
      {progress.arrived && (
        <motion.button className="btn primary small" onClick={onCheckIn} whileTap={{ scale: 0.95 }} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          Check in
        </motion.button>
      )}
      <button className="walk-banner-end" onClick={onEnd} aria-label="End walk">
        <X size={16} strokeWidth={2.6} />
      </button>
    </motion.div>
  )
}
