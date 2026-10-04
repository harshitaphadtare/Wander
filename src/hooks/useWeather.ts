import { useEffect, useState } from 'react'
import type { LatLng } from '../lib/geo'
import { hourlyForecast, type WeatherHour } from '../lib/weather'

/** Hourly forecast near a point; `null` while loading, `'error'` if unavailable. */
export function useWeather(at: LatLng | null) {
  const [hours, setHours] = useState<WeatherHour[] | 'error' | null>(null)
  const lat = at?.lat
  const lng = at?.lng

  useEffect(() => {
    if (lat === undefined || lng === undefined) return
    const ctrl = new AbortController()
    hourlyForecast({ lat, lng }, ctrl.signal)
      .then(setHours)
      .catch(() => {
        if (!ctrl.signal.aborted) setHours('error')
      })
    return () => ctrl.abort()
  }, [lat, lng])

  return hours
}
