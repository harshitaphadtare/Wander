import { Check, CircleAlert, Info } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

export interface ToastMessage {
  id: number
  text: string
  tone?: 'info' | 'success' | 'error'
  /** One quick follow-up, e.g. Undo. Toasts with an action stay up a little longer. */
  action?: { label: string; onClick(): void }
}

const ICONS = { info: Info, success: Check, error: CircleAlert }

/** Dynamic-Island-style pill that drops in from the top. */
export default function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone(): void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, toast.tone === 'error' || toast.action ? 5500 : 3000)
    return () => clearTimeout(t)
  }, [toast, onDone])

  const Icon = ICONS[toast?.tone ?? 'info']
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className={`toast toast-${toast.tone ?? 'info'}`}
          role="status"
          onClick={onDone}
          initial={{ y: -28, opacity: 0, scale: 0.9, x: '-50%' }}
          animate={{ y: 0, opacity: 1, scale: 1, x: '-50%' }}
          exit={{ y: -18, opacity: 0, scale: 0.94, x: '-50%', transition: { duration: 0.18 } }}
          transition={{ type: 'spring', stiffness: 460, damping: 32 }}
        >
          <span className="toast-icon">
            <Icon size={15} strokeWidth={2.6} />
          </span>
          <span className="toast-text">{toast.text}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={(e) => {
                e.stopPropagation()
                toast.action!.onClick()
                onDone()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
