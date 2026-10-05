import { BookOpen, Compass, Lock } from 'lucide-react'
import { motion } from 'motion/react'
import HeroMap from '../landing/HeroMap'
import { linkProps } from '../lib/router'
import { AppIcon } from '../ui/Logo'
import './auth.css'
import AuthPanel, { type AuthView } from './AuthPanel'

const ease = [0.16, 1, 0.3, 1] as const

const POINTS = [
  { icon: Compass, text: 'Picks for somewhere new, every week' },
  { icon: BookOpen, text: 'A journal of every place you’ve been' },
  { icon: Lock, text: 'Encrypted on your phone before it syncs' },
]

/**
 * /login and /signup. The split-screen pattern from shadcn/ui's login-02 block:
 * logo pinned top-left, a narrow form centred in the left column, fine print at
 * the bottom, and a full-bleed visual on the right (wide screens only).
 */
export default function AuthPage({ view, standalone }: { view: AuthView; standalone: boolean }) {
  return (
    <div className="auth-page">
      <main className="auth-main">
        <a className="auth-logo-link" {...(standalone ? {} : linkProps('/'))} aria-label="Wander home">
          <AppIcon size={28} />
          <span className="display">Wander</span>
        </a>

        <motion.div className="auth-column" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          <AuthPanel initial={view} />
        </motion.div>

        <p className="auth-legal">We never sell or share your data. Photos stay on your phone.</p>
      </main>

      <aside className="auth-visual" aria-hidden>
        <HeroMap panel />
        <div className="auth-visual-shade" />
        <div className="auth-visual-copy">
          <motion.h2 className="display" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7, ease }}>
            Your city, <em>remembered.</em>
          </motion.h2>
          <ul>
            {POINTS.map(({ icon: Icon, text }, i) => (
              <motion.li key={text} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.08, duration: 0.6, ease }}>
                <Icon size={16} strokeWidth={2.3} />
                {text}
              </motion.li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
