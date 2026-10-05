import { Coffee, Heart, MapPin, Star, Trees, Utensils } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import './heromap.css'

const ease = [0.16, 1, 0.3, 1] as const

// Pins use the app's level colours (lib/levels.ts).
const PINS = [
  { x: 74, y: 150, color: '#F29D0C', icon: Coffee },
  { x: 214, y: 118, color: '#12A187', icon: Trees },
  { x: 236, y: 300, color: '#E8457A', icon: Utensils },
  { x: 58, y: 352, color: '#7357F6', icon: Star },
  { x: 166, y: 420, color: '#12A187', icon: Coffee },
  { x: 118, y: 236, color: '#8C877E', icon: MapPin },
]

const ROUTE = 'M150 505 C 150 470, 150 455, 166 430 S 196 380, 200 340 S 236 310, 236 300'

/** Illustrated, animated stand-in for the live map inside the hero phone. */
/** `panel`: no phone UI (search bar, dock); used full-bleed beside the sign-in form. */
export default function HeroMap({ panel = false }: { panel?: boolean }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 3), 3200)
    return () => clearInterval(t)
  }, [])

  return (
    <div className={`hm ${panel ? 'hm-panel' : ''}`}>
      <svg viewBox="0 0 300 600" className="hm-svg" aria-hidden preserveAspectRatio="xMidYMid slice">
        <rect width="300" height="600" fill="#f2efe8" />
        {/* water */}
        <motion.path
          d="M-10 520 C 60 500, 90 560, 170 545 S 280 500, 320 520 L 320 620 L -10 620 Z"
          fill="#bfdcf2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        />
        {/* parks */}
        <rect x="180" y="70" width="90" height="90" rx="14" fill="#cfe8c4" />
        <rect x="20" y="300" width="80" height="110" rx="14" fill="#d8edcf" />
        {/* blocks */}
        {Array.from({ length: 6 }, (_, r) =>
          Array.from({ length: 4 }, (_, c) => (
            <rect key={`${r}-${c}`} x={12 + c * 72} y={18 + r * 82} width="60" height="68" rx="8" fill="#e8e3d8" opacity={0.55} />
          )),
        )}
        {/* streets */}
        <g stroke="#fff" strokeLinecap="round">
          {[10, 82, 154, 226, 298].map((x) => (
            <line key={`v${x}`} x1={x - 4} y1="0" x2={x + 6} y2="600" strokeWidth="9" />
          ))}
          {[12, 94, 176, 258, 340, 422, 504].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="300" y2={y + 4} strokeWidth="9" />
          ))}
          <path d="M-10 250 C 80 220, 200 300, 320 230" fill="none" strokeWidth="14" stroke="#fde6b8" />
        </g>

        {/* route */}
        <motion.path
          d={ROUTE}
          fill="none"
          stroke="#f2542d"
          strokeWidth="6"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.2, ease: 'easeInOut', delay: 1.1, repeat: Infinity, repeatType: 'loop', repeatDelay: 2.6 }}
        />
        <path d={ROUTE} fill="none" stroke="#f2542d" strokeWidth="14" strokeLinecap="round" opacity="0.12" />

        {/* me */}
        <circle cx="150" cy="505" r="22" fill="#2f7bf6" opacity="0.15" className="hm-pulse" />
        <circle cx="150" cy="505" r="8" fill="#2f7bf6" stroke="#fff" strokeWidth="3" />
      </svg>

      {PINS.map((p, i) => (
        <motion.span
          key={i}
          className="hm-pin"
          style={{ left: `${(p.x / 300) * 100}%`, top: `${(p.y / 600) * 100}%`, background: p.color }}
          initial={{ scale: 0, y: -16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.5 + i * 0.12 }}
        >
          <p.icon size={13} strokeWidth={2.6} />
        </motion.span>
      ))}

      {!panel && (
      <div className="hm-search">
        <span className="hm-search-dot" />
        Search places
      </div>
      )}

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="a" className="hm-card" {...card}>
            <span className="hm-card-icon" style={{ background: '#F29D0C' }}>
              <Coffee size={16} strokeWidth={2.4} />
            </span>
            <div>
              <strong>Checked in at Patricia</strong>
              <small>2nd visit · now a Favourite</small>
            </div>
          </motion.div>
        )}
        {step === 1 && (
          <motion.div key="b" className="hm-card" {...card}>
            <span className="hm-card-icon" style={{ background: '#f2542d' }}>
              <Heart size={16} strokeWidth={2.4} />
            </span>
            <div>
              <strong>18 min walk · leave by 5:40</strong>
              <small>Sunset 6:12 · clear skies</small>
            </div>
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="c" className="hm-card" {...card}>
            <span className="hm-card-icon" style={{ background: '#12A187' }}>
              <Trees size={16} strokeWidth={2.4} />
            </span>
            <div>
              <strong>You’re at Fitzroy Gardens</strong>
              <small>Tap to check in</small>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!panel && (
      <div className="hm-dock">
        {['Map', 'Places', 'Journal', 'Settings'].map((t, i) => (
          <span key={t} className={i === 0 ? 'on' : ''}>
            <i />
            {t}
          </span>
        ))}
      </div>
      )}
    </div>
  )
}

const card = {
  initial: { opacity: 0, y: 18, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.98 },
  transition: { duration: 0.45, ease },
}
