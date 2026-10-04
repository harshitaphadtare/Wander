import { useCallback, useEffect, useRef, useState } from 'react'
import { geoErrorMessage } from '../lib/geo'

export interface Fix {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

const GRANTED_KEY = 'wander:geo-granted'

function toFix(p: GeolocationPosition): Fix {
  return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }
}

/**
 * Watches the device position. To avoid a permission prompt the moment the app
 * opens for the first time, watching only starts automatically once location has
 * been granted before; otherwise it starts when `start()` is called (e.g. on tap).
 */
export function useGeolocation() {
  const [fix, setFix] = useState<Fix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [watching, setWatching] = useState(false)
  const watchId = useRef<number | null>(null)

  const start = useCallback(() => {
    if (watchId.current !== null || !('geolocation' in navigator)) return
    setWatching(true)
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        localStorage.setItem(GRANTED_KEY, '1')
        setError(null)
        setFix(toFix(p))
      },
      (err) => {
        setError(geoErrorMessage(err))
        if (err.code === err.PERMISSION_DENIED) {
          localStorage.removeItem(GRANTED_KEY)
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
          watchId.current = null
          setWatching(false)
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    )
  }, [])

  // Dev only: simulate GPS from the console, e.g. __wanderFix(-37.8678, 144.976)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __wanderFix?: (lat: number, lng: number, accuracy?: number) => void }
    w.__wanderFix = (lat, lng, accuracy = 15) => setFix({ lat, lng, accuracy, timestamp: Date.now() })
    return () => {
      delete w.__wanderFix
    }
  }, [])

  useEffect(() => {
    if (localStorage.getItem(GRANTED_KEY)) start()
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [start])

  return { fix, error, watching, start }
}
