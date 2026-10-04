import { useSyncExternalStore } from 'react'

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => matchMedia(query).matches,
  )
}

export const DESKTOP_QUERY = '(min-width: 900px)'

export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY)
