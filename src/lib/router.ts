import { useSyncExternalStore } from 'react'

/**
 * A tiny path router: the app only has a handful of screens, so no library.
 *
 *   /                 landing page
 *   /login, /signup   sign in / create account
 *   /reset-password   where the password-reset email lands
 *   /app              the map (needs an account)
 *
 * Vercel / Cloudflare Pages serve index.html for every path (vercel.json), and
 * the service worker does the same offline.
 */
export type Route = '/' | '/login' | '/signup' | '/reset-password' | '/app'

const ROUTES: Route[] = ['/', '/login', '/signup', '/reset-password', '/app']

function read(): Route {
  const p = location.pathname.replace(/\/+$/, '') || '/'
  return (ROUTES as string[]).includes(p) ? (p as Route) : '/'
}

let current = read()
// Unknown paths show the landing page; make the address bar say so too.
if (current === '/' && location.pathname !== '/') history.replaceState(null, '', '/' + location.search + location.hash)
const listeners = new Set<() => void>()
const emit = () => {
  current = read()
  for (const fn of listeners) fn()
}
window.addEventListener('popstate', emit)

export function navigate(to: Route, opts: { replace?: boolean } = {}) {
  if (to === current && location.pathname === to) return
  // Keep the hash: Supabase puts sign-in tokens there on the way back from Google / email links.
  const url = to + location.search + location.hash
  if (opts.replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  emit()
  document.querySelector('.lp')?.scrollTo({ top: 0 })
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    () => current,
  )
}

/** For links: real hrefs (open in new tab works), client-side navigation on plain clicks. */
export function linkProps(to: Route) {
  return {
    href: to,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(to)
    },
  }
}
