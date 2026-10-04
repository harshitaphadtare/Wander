import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { LEVELS, type Level } from '../lib/levels'
import { LEVEL_ICONS } from './icons'

export interface CelebrationData {
  id: number
  level: Level
  placeName: string
  visits: number
}

const COLORS = [...LEVELS.slice(1).map((l) => l.color), '#ffffff']

/** Full-screen level-up moment: badge springs in, confetti bursts out. */
export default function Celebration({ data, onDone }: { data: CelebrationData | null; onDone(): void }) {
  useEffect(() => {
    if (!data) return
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [data, onDone])

  return (
    <AnimatePresence>
      {data && <CelebrationInner key={data.id} data={data} onDone={onDone} />}
    </AnimatePresence>
  )
}

function CelebrationInner({ data, onDone }: { data: CelebrationData; onDone(): void }) {
  const Icon = LEVEL_ICONS[data.level.key]
  const confetti = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        const angle = (i / 34) * Math.PI * 2 + Math.random() * 0.4
        const dist = 120 + Math.random() * 140
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist - 40,
          rotate: Math.random() * 540 - 270,
          color: COLORS[i % COLORS.length],
          w: 6 + Math.random() * 6,
          h: 10 + Math.random() * 8,
          delay: Math.random() * 0.08,
          round: Math.random() > 0.6,
        }
      }),
    [],
  )

  return (
    <motion.div
      className="celebrate"
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <div className="celebrate-stage">
        {confetti.map((c, i) => (
          <motion.span
            key={i}
            className="confetti"
            style={{ background: c.color, width: c.w, height: c.round ? c.w : c.h, borderRadius: c.round ? '50%' : 2 }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
            animate={{ x: c.x, y: [0, c.y, c.y + 160], opacity: [1, 1, 0], rotate: c.rotate, scale: 1 }}
            transition={{ duration: 1.6, delay: 0.12 + c.delay, ease: [0.16, 1, 0.3, 1], times: [0, 0.45, 1] }}
          />
        ))}
        <motion.div
          className="celebrate-badge"
          style={{ '--c': data.level.color } as React.CSSProperties}
          initial={{ scale: 0.3, rotate: -18, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14 }}
        >
          <Icon size={46} strokeWidth={2} fill="currentColor" fillOpacity={0.25} />
        </motion.div>
      </div>
      <motion.div
        className="celebrate-text"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.22, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="eyebrow">New level unlocked</div>
        <h2 className="display">{data.level.label}</h2>
        <p>
          {data.placeName} · {data.visits} visits
        </p>
      </motion.div>
    </motion.div>
  )
}
