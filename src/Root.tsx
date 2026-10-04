import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import AuthDialog from './auth/AuthDialog'
import type { AuthView } from './auth/AuthPanel'
import { AUTH_EVENT, continueAsGuest, useAuth } from './lib/auth'

// Split so the landing page doesn't wait for the map, and vice versa.
const App = lazy(() => import('./App'))
const Landing = lazy(() => import('./landing/Landing'))
const ResetPassword = lazy(() => import('./auth/ResetPassword'))

const isStandalone =
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/**
 * Decides what to show: the reset-password screen when arriving from that
 * email, the app when signed in or using Wander without an account, and the
 * landing page otherwise. The installed iPhone app skips the marketing page
 * and opens straight to sign-in.
 */
export default function Root() {
  const auth = useAuth()
  const [dialog, setDialog] = useState<AuthView | null>(null)
  const close = useCallback(() => setDialog(null), [])

  useEffect(() => {
    const onOpen = (e: Event) => setDialog((e as CustomEvent<AuthView>).detail)
    window.addEventListener(AUTH_EVENT, onOpen)
    return () => window.removeEventListener(AUTH_EVENT, onOpen)
  }, [])

  // Signing in from the dialog closes it.
  useEffect(() => {
    if (auth.session) setDialog(null)
  }, [auth.session])

  const screen = !auth.ready ? 'boot' : auth.recovering ? 'reset' : auth.session || auth.guest ? 'app' : 'landing'
  const guest = () => {
    continueAsGuest(true)
    setDialog(null)
  }

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          className="root-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Suspense fallback={null}>
            {screen === 'app' && <App />}
            {screen === 'reset' && <ResetPassword />}
            {screen === 'landing' && <Landing standalone={isStandalone} onAuth={setDialog} onGuest={guest} />}
          </Suspense>
        </motion.div>
      </AnimatePresence>
      <AuthDialog open={!!dialog && screen !== 'reset'} view={dialog ?? 'signin'} onClose={close} onGuest={screen === 'landing' ? guest : undefined} />
    </>
  )
}
