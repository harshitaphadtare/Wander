import { Check, CircleAlert, Info } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

export interface ToastMessage {
  id: number
  text: string
  tone?: 'info' | 'success' | 'error'
}

const ICONS = { info: Info, success: Check, error: CircleAlert }

/** Dynamic-Island-style pill that drops in from the top. */
export default function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone(): void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, toast.tone === 'error' ? 5000 : 3000)
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
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
