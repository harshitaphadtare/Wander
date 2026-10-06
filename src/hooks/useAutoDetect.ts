import { useEffect, useRef } from 'react'
import { distanceM, type LatLng } from '../lib/geo'
import type { Fix } from './useGeolocation'

export const DWELL_RADIUS_M = 75
export const DWELL_TIME_MS = 10 * 60 * 1000
/** Fixes worse than this are too fuzzy to judge a dwell. */
const MAX_ACCURACY_M = 100
/** Phones often stop sending fixes while you stand still, so also re-check on a timer. */
const CHECK_EVERY_MS = 30_000
/** Trust the last fix as "still here" for this long without a new one. */
const MAX_FIX_AGE_MS = 3 * 60 * 1000
/**
 * A gap this long between checks means the app was closed or frozen (iOS
 * suspends web apps instead of reloading them). We didn't see you during the
 * gap, so it can't count towards a dwell.
 */
const MAX_GAP_MS = 2 * 60 * 1000

interface Options {
  enabled: boolean
  /** Called once per dwell when you've stayed put long enough. Return the visit id to close later, or null if nothing was logged. */
  onDwell: (at: LatLng, since: number) => Promise<string | null>
  /** Called when you walk away from a spot that was logged. */
  onLeave: (visitId: string) => void
}

/**
 * Notices when you stay within ~75 m of one spot for 10+ minutes while the app
 * is open. iOS web apps can't track location in the background, so only time
 * Wander is actually on screen counts: reopening the app hours later in the
 * same spot is not a dwell.
 */
export function useAutoDetect(fix: Fix | null, { enabled, onDwell, onLeave }: Options) {
  const anchor = useRef<{ at: LatLng; since: number } | null>(null)
  const lastFixAt = useRef(0)
  /** Last time the app was demonstrably running (a fix or a timer tick). */
  const lastSeen = useRef(0)
  const loggedVisit = useRef<string | null>(null)
  const pending = useRef(false)
  const callbacks = useRef({ onDwell, onLeave })
  useEffect(() => {
    callbacks.current = { onDwell, onLeave }
  })

  /** Restart the dwell clock if the app was away; returns true if it did. */
  const resumeGap = useRef(() => {
    const now = Date.now()
    const away = lastSeen.current && now - lastSeen.current > MAX_GAP_MS
    lastSeen.current = now
    if (away && anchor.current && !loggedVisit.current) anchor.current = { ...anchor.current, since: now }
    return !!away
  })

  const checkDwell = useRef(() => {
    if (resumeGap.current()) return
    const a = anchor.current
    const now = Date.now()
    if (!a || loggedVisit.current || pending.current) return
    if (now - lastFixAt.current > MAX_FIX_AGE_MS || now - a.since < DWELL_TIME_MS) return
    pending.current = true
    callbacks.current
      .onDwell(a.at, a.since)
      // Mark as handled even if nothing was logged, so we don't retry every fix.
      .then((id) => (loggedVisit.current = id ?? 'skipped'))
      .catch(() => (loggedVisit.current = 'skipped'))
      .finally(() => (pending.current = false))
  })

  // Track where you are; a move of more than ~75 m starts a new dwell.
  useEffect(() => {
    if (!enabled) {
      anchor.current = null
      loggedVisit.current = null
      return
    }
    if (!fix || fix.accuracy > MAX_ACCURACY_M) return
    // A cached fix from before the app was reopened says nothing about now.
    if (Date.now() - fix.timestamp > MAX_GAP_MS) return
    resumeGap.current()
    const here = { lat: fix.lat, lng: fix.lng }
    lastFixAt.current = Date.now()

    if (!anchor.current || distanceM(anchor.current.at, here) > DWELL_RADIUS_M) {
      if (loggedVisit.current && loggedVisit.current !== 'skipped') callbacks.current.onLeave(loggedVisit.current)
      anchor.current = { at: here, since: Date.now() }
      loggedVisit.current = null
      return
    }
    checkDwell.current()
  }, [fix, enabled])

  useEffect(() => {
    if (!enabled) return
    lastSeen.current = Date.now()
    const id = setInterval(() => checkDwell.current(), CHECK_EVERY_MS)
    // Going to the background ends what we can observe; start fresh on return.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && anchor.current && !loggedVisit.current) anchor.current = null
      lastSeen.current = Date.now()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])
}
