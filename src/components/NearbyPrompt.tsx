import { X } from 'lucide-react'
import { motion } from 'motion/react'
import type { PlaceWithStats } from '../hooks/useData'
import { plural } from '../lib/format'
import { IconTile } from '../ui/bits'
import { categoryIcon } from '../ui/icons'

interface Props {
  place: PlaceWithStats
  onCheckIn(): void
  onOpen(): void
  onDismiss(): void
}

/** "You're at Cafe Luna" card: one tap to check in when you open the app at a saved place. */
export default function NearbyPrompt({ place, onCheckIn, onOpen, onDismiss }: Props) {
  return (
    <motion.div
      className="nearby glass"
      initial={{ y: 30, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 20, opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={(_, info) => Math.abs(info.offset.x) > 90 && onDismiss()}
    >
      <button className="nearby-main" onClick={onOpen}>
        <IconTile icon={categoryIcon(place.category)} color={place.level.color} size={44} />
        <span className="row-text">
          <small className="eyebrow">You're at</small>
          <strong className="display">{place.name}</strong>
          <small>
            {place.level.label} · {plural(place.visitCount, 'visit')}
          </small>
        </span>
      </button>
      <motion.button className="btn primary small" onClick={onCheckIn} whileTap={{ scale: 0.95 }}>
        Check in
      </motion.button>
      <button className="nearby-close" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} strokeWidth={2.6} />
      </button>
    </motion.div>
  )
}
