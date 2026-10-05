import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { useAuth } from './lib/auth'
import { navigate, useRoute } from './lib/router'

// Split so the landing page doesn't wait for the map, and vice versa.
const App = lazy(() => import('./App'))
const Landing = lazy(() => import('./landing/Landing'))
const AuthPage = lazy(() => import('./auth/AuthPage'))
const ResetPassword = lazy(() => import('./auth/ResetPassword'))

const isStandalone =
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/**
 * Full-screen containers size to the area iOS actually draws (100dvh), never
 * to screen.height: in the iOS 26 home-screen app the drawable area can be one
 * status bar shorter than the screen, and anything taller is clipped (that cut
 * the dock off). The gap itself is fixed in index.css (standalone html height).
 */

/**
 * Full-screen containers must never scroll. Browsers still scroll an
 * overflow:hidden box to reveal a focused element, and iOS scrolls the page up
 * for the keyboard and often doesn't scroll it back, which left a gap at the bottom.
 */
function keepFullScreenPinned() {
  const pinned = (el: EventTarget | null): el is HTMLElement =>
    el instanceof HTMLElement && (el.classList.contains('app') || el.classList.contains('root-screen') || el.id === 'root')
  // Scroll events don't bubble, but a capturing listener on document still sees them.
  document.addEventListener(
    'scroll',
    (e) => {
      if (pinned(e.target) && (e.target.scrollTop || e.target.scrollLeft)) e.target.scrollTo(0, 0)
    },
    true,
  )
  const editing = () => {
    const a = document.activeElement
    return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a instanceof HTMLElement && a.isContentEditable)
  }
  const reset = () => {
    if (!editing() && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0)
  }
  document.addEventListener('focusout', () => setTimeout(reset, 80))
  window.visualViewport?.addEventListener('resize', () => setTimeout(reset, 80))
}
keepFullScreenPinned()

/**
 * Routes:
 *   /                landing page (the installed app skips it)
 *   /login /signup   sign in or create an account
 *   /reset-password  choose a new password (from the reset email)
 *   /app             the map; needs an account
 */
export default function Root() {
  const auth = useAuth()
  const route = useRoute()

  // Redirects, once we know whether you're signed in.
  useEffect(() => {
    if (!auth.ready) return
    if (auth.recovering) {
      if (route !== '/reset-password') navigate('/reset-password', { replace: true })
      return
    }
    const signedIn = !!auth.session
    if (route === '/app' && !signedIn) navigate('/login', { replace: true })
    else if ((route === '/login' || route === '/signup') && signedIn) navigate('/app', { replace: true })
    else if (route === '/reset-password' && !signedIn) navigate('/login', { replace: true })
    else if (route === '/' && isStandalone) navigate(signedIn ? '/app' : '/login', { replace: true })
  }, [auth.ready, auth.session, auth.recovering, route])

  const screen = !auth.ready ? 'boot' : route

  return (
    /* Crossfade (not mode="wait") so the next screen never waits on an exit animation. */
    <AnimatePresence initial={false}>
      <motion.div
        key={screen === '/signup' ? '/login' : screen}
        className="root-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, pointerEvents: 'none' }}
        transition={{ duration: 0.3 }}
      >
        <Suspense fallback={null}>
          {screen === '/' && <Landing signedIn={!!auth.session} />}
          {(screen === '/login' || screen === '/signup') && (
            <AuthPage view={screen === '/signup' ? 'signup' : 'signin'} standalone={isStandalone} />
          )}
          {screen === '/reset-password' && auth.session && <ResetPassword />}
          {screen === '/app' && auth.session && <App />}
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}
