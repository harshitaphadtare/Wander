import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(async () => false)

/** Promise-based replacement for window.confirm with a proper dialog. */
export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(undefined)

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o)
    return new Promise((resolve) => (resolver.current = resolve))
  }, [])

  const answer = (v: boolean) => {
    resolver.current?.(v)
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {opts && (
          <motion.div
            className="dialog-backdrop"
            onClick={() => answer(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="dialog"
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              initial={{ y: 40, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.98, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <h3 className="display">{opts.title}</h3>
              {opts.message && <p>{opts.message}</p>}
              <div className="dialog-actions">
                <motion.button className="btn" whileTap={{ scale: 0.97 }} onClick={() => answer(false)}>
                  {opts.cancelLabel ?? 'Cancel'}
                </motion.button>
                <motion.button
                  className={`btn ${opts.destructive ? 'danger-solid' : 'primary'}`}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => answer(true)}
                  autoFocus
                >
                  {opts.confirmLabel ?? 'OK'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  )
}
