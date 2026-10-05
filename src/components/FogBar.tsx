import { CloudFog, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { FogResult } from '../lib/fog'
import { FOG_RADIUS_M } from '../lib/fog'
import type { LatLng } from '../lib/geo'
import { reverseGeocode } from '../lib/photon'
import { CountUp, Segmented } from '../ui/bits'

export type MapMode = 'heat' | 'fog'

interface Props {
  center: LatLng
  fog: FogResult
  onMode(mode: MapMode): void
  onClose(): void
}

/** Explored %: how much of the area around where you're looking you've uncovered. */
export default function FogBar({ center, fog, onMode, onClose }: Props) {
  const [area, setArea] = useState<string | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    reverseGeocode(center, ctrl.signal)
      .then((r) => {
        // Prefer the suburb from the address ("… , Carlton, Melbourne").
        const parts = r[0]?.address?.split(',').map((s) => s.trim()) ?? []
        setArea(parts.find((p) => p && !/\d/.test(p)) ?? r[0]?.name ?? null)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [center])

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
            <CountUp value={whole} />% explored
          </strong>
          <small>
            {fog.explored} of {fog.total} blocks within {FOG_RADIUS_M / 1000} km{area ? ` of ${area}` : ''}
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
          ['heat', 'Heatmap'],
          ['fog', 'Explored'],
        ]}
      />
      <div className="fog-progress" aria-hidden>
        <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: Math.max(0.01, fog.percent / 100) }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
      <p className="fog-hint">The mist clears where you’ve checked in or walked. Pan the map and reopen to measure somewhere else.</p>
    </motion.div>
  )
}
