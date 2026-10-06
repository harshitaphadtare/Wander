import { CloudFog, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { FogResult } from '../lib/fog'
import { FOG_RADIUS_M } from '../lib/fog'
import { CountUp, Segmented } from '../ui/bits'

export type MapMode = 'heat' | 'fog'

interface Props {
  fog: FogResult
  onMode(mode: MapMode): void
  onClose(): void
}

/** Explored %: how much of the suburb you're looking at you've uncovered. */
export default function FogBar({ fog, onMode, onClose }: Props) {
  const whole = Math.floor(fog.percent)
  return (
    <motion.div
      className="heat-bar fog-bar glass"
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <div className="heat-bar-head">
        <span className="heat-bar-icon fog" aria-hidden>
          <CloudFog size={17} strokeWidth={2.4} />
        </span>
        <span className="heat-bar-title">
          <strong className="display">
            <CountUp value={whole} />% {fog.suburb ? `of ${fog.suburb}` : 'explored'}
          </strong>
          <small>
            {fog.suburb
              ? `You’ve been around ${fog.explored} of its ${fog.total} blocks`
              : `${fog.explored} of ${fog.total} blocks within ${FOG_RADIUS_M / 1000} km`}
          </small>
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close explored view">
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>
      <Segmented<MapMode>
        id="map-mode"
        value="fog"
        onChange={onMode}
        options={[
          ['heat', 'Where you go'],
          ['fog', 'How much explored'],
        ]}
      />
      <div className="fog-progress" aria-hidden>
        <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: Math.max(0.01, fog.percent / 100) }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
      <p className="fog-hint">
        The mist clears where you’ve checked in or walked. Move the map to another suburb and reopen to measure there.
      </p>
    </motion.div>
  )
}
