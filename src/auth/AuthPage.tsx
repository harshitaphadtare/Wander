import { ArrowLeft, BookOpen, Compass, Lock } from 'lucide-react'
import { motion } from 'motion/react'
import HeroMap from '../landing/HeroMap'
import { linkProps } from '../lib/router'
import { LogoMark } from '../ui/Logo'
import './auth.css'
import AuthPanel, { type AuthView } from './AuthPanel'

const ease = [0.16, 1, 0.3, 1] as const

const POINTS = [
  { icon: Compass, text: 'Picks for somewhere new, every week' },
  { icon: BookOpen, text: 'A journal of every place you’ve been' },
  { icon: Lock, text: 'Encrypted on your phone before it syncs' },
]

/** /login and /signup: full-screen on phones, split with a brand panel on wide screens. */
export default function AuthPage({ view, standalone }: { view: AuthView; standalone: boolean }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside" aria-hidden>
        <div className="auth-aside-glow" />
        <a className="auth-aside-logo" {...linkProps('/')}>
          <LogoMark size={22} />
          <span className="display">Wander</span>
        </a>
        <motion.div className="auth-aside-phone" initial={{ opacity: 0, y: 40, rotate: 3 }} animate={{ opacity: 1, y: 0, rotate: -4 }} transition={{ duration: 1.1, ease }}>
          <HeroMap />
        </motion.div>
        <div className="auth-aside-copy">
          <h2 className="display">
            Your city,
            <br />
            <em>remembered.</em>
          </h2>
          <ul>
            {POINTS.map(({ icon: Icon, text }, i) => (
              <motion.li key={text} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.1, duration: 0.6, ease }}>
                <Icon size={16} strokeWidth={2.3} />
                {text}
              </motion.li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-page-glow" aria-hidden />
        {!standalone && (
          <a className="auth-home" {...linkProps('/')}>
            <ArrowLeft size={17} strokeWidth={2.4} />
            <span>Home</span>
          </a>
        )}
        <motion.div className="auth-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease }}>
          <AuthPanel initial={view} />
        </motion.div>
        <p className="auth-legal">By continuing you agree to use Wander kindly. We never sell or share your data.</p>
      </main>
    </div>
  )
}
