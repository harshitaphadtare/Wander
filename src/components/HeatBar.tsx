import { Flame, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { plural } from '../lib/format'
import type { HeatSummary } from '../lib/heat'
import { PERIOD_OPTIONS, type Period } from '../lib/periods'
import { Segmented } from '../ui/bits'
import type { MapMode } from './FogBar'

interface Props {
  period: Period
  summary: HeatSummary
  onPeriod(period: Period): void
  onMode(mode: MapMode): void
  onClose(): void
}

/** Floating controls for heat mode: period, what you're looking at, and a way out. */
export default function HeatBar({ period, summary, onPeriod, onMode, onClose }: Props) {
  const empty = summary.visits === 0
  return (
    <motion.div
      className="heat-bar glass"
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    >
      <div className="heat-bar-head">
        <span className="heat-bar-icon" aria-hidden>
          <Flame size={17} strokeWidth={2.4} />
        </span>
        <span className="heat-bar-title">
          <strong className="display">Where you go</strong>
          <AnimatePresence mode="wait" initial={false}>
            <motion.small
              key={`${period}-${summary.visits}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {empty
                ? `No visits ${period === 'all' ? 'yet' : `this ${period}`}`
                : `${plural(summary.visits, 'visit')} · ${plural(summary.places, 'place')}`}
            </motion.small>
          </AnimatePresence>
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close heatmap">
          <X size={16} strokeWidth={2.4} />
        </button>
      </div>

      <Segmented<MapMode>
        id="map-mode"
        value="heat"
        onChange={onMode}
        options={[
          ['heat', 'Where you go'],
          ['fog', 'How much explored'],
        ]}
      />
      <Segmented<Period> id="heat-period" value={period} onChange={onPeriod} options={PERIOD_OPTIONS} />

      {!empty && (
        <div className="heat-foot">
          {summary.top && (
            <span className="heat-top">
              Hottest: <strong>{summary.top.name}</strong>
            </span>
          )}
          <span className="heat-legend" aria-hidden>
            Less <span className="heat-ramp" /> More
          </span>
        </div>
      )}
    </motion.div>
  )
}
