import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import './auth.css'
import AuthPanel, { type AuthView } from './AuthPanel'

const ease = [0.16, 1, 0.3, 1] as const

/** Sign-in as a centred card on desktop and a full-height sheet on phones. */
export default function AuthDialog({
  open,
  view,
  onClose,
  onGuest,
}: {
  open: boolean
  view: AuthView
  onClose(): void
  onGuest?: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="auth-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <div className="auth-scrim" onClick={onClose} />
          <motion.div
            className="auth-card dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Sign in to Wander"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98, transition: { duration: 0.2 } }}
            transition={{ duration: 0.45, ease }}
          >
            <button className="auth-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
            <AuthPanel key={view} initial={view} onGuest={onGuest} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
