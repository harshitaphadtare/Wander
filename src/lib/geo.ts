import turfDistance from '@turf/distance'

export interface LatLng {
  lat: number
  lng: number
}

/** Distance in metres between two points. */
export function distanceM(a: LatLng, b: LatLng): number {
  return turfDistance([a.lng, a.lat], [b.lng, b.lat], { units: 'meters' })
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`
}

export function getCurrentPosition(timeoutMs = 15_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser has no location support.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 10_000,
    })
  })
}

export function geoErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    switch ((err as GeolocationPositionError).code) {
      case 1:
        return 'Location permission is off. Allow location for this site in your browser settings.'
      case 2:
        return "Couldn't get a location fix. Try again outside or near a window."
      case 3:
        return 'Location took too long. Try again.'
    }
  }
  return err instanceof Error ? err.message : 'Location unavailable.'
}
