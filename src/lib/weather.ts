import type { LatLng } from './geo'

/**
 * Hourly forecast from Open-Meteo (free, keyless, CORS-friendly).
 * Cached per ~1 km cell for 30 minutes so reopening the walk sheet costs nothing.
 */
const URL = 'https://api.open-meteo.com/v1/forecast'
const TTL_MS = 30 * 60_000
const STORE_KEY = 'wander:weather'

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

export interface WeatherHour {
  /** start of the hour, ms */
  t: number
  tempC: number
  /** chance of rain, 0–100 */
  rainPct: number
  sky: Sky
  isDay: boolean
}

/** WMO weather code → a handful of sky kinds we draw icons for. */
function skyFor(code: number): Sky {
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'rain' // 61–67, 80–82
}

export const SKY_LABEL: Record<Sky, string> = {
  clear: 'Clear',
  partly: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Foggy',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Thunderstorms',
}

interface Cached {
  key: string
  fetchedAt: number
  hours: WeatherHour[]
}

let memo: Cached | null = null

function cellKey(at: LatLng) {
  return `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`
}

function readStore(): Cached | null {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
  } catch {
    return null
  }
}

export async function hourlyForecast(at: LatLng, signal?: AbortSignal): Promise<WeatherHour[]> {
  const key = cellKey(at)
  const cached = memo?.key === key ? memo : readStore()
  if (cached?.key === key && Date.now() - cached.fetchedAt < TTL_MS) return cached.hours

  const params = new URLSearchParams({
    // Weather doesn't change within a kilometre; don't send more precision than that.
    latitude: at.lat.toFixed(2),
    longitude: at.lng.toFixed(2),
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
    forecast_days: '2',
    timeformat: 'unixtime',
    timezone: 'auto',
  })
  const res = await fetch(`${URL}?${params}`, { signal })
  if (!res.ok) {
    // Stale beats nothing.
    if (cached?.key === key) return cached.hours
    throw new Error(`Weather service error (${res.status})`)
  }
  const { hourly: h } = (await res.json()) as {
    hourly: {
      time: number[]
      temperature_2m: number[]
      precipitation_probability: (number | null)[]
      weather_code: number[]
      is_day: number[]
    }
  }
  const hours = h.time.map((s, i) => ({
    t: s * 1000,
    tempC: h.temperature_2m[i],
    rainPct: h.precipitation_probability[i] ?? 0,
    sky: skyFor(h.weather_code[i]),
    isDay: h.is_day[i] === 1,
  }))
  memo = { key, fetchedAt: Date.now(), hours }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(memo))
  } catch {
    // Storage full or blocked: the in-memory copy still works.
  }
  return hours
}

/** The forecast hours that overlap [from, to], padded to at least `min` hours. */
export function hoursBetween(hours: WeatherHour[], from: number, to: number, min = 5): WeatherHour[] {
  const startIdx = hours.findIndex((h) => h.t + 3_600_000 > from)
  if (startIdx < 0) return []
  let endIdx = hours.findIndex((h) => h.t >= to)
  if (endIdx < 0) endIdx = hours.length
  return hours.slice(startIdx, Math.max(endIdx, startIdx + min))
}

/** One line of advice for the walk window, or null when it looks fine. */
export function walkAdvice(window: WeatherHour[]): string | null {
  if (window.length === 0) return null
  const wettest = window.reduce((a, b) => (b.rainPct > a.rainPct ? b : a))
  if (window.some((h) => h.sky === 'storm')) return 'Storms are possible. Maybe pick another time.'
  if (wettest.rainPct >= 60) return `Rain is likely around ${hourLabel(wettest.t)}. Take an umbrella.`
  if (wettest.rainPct >= 30) return `There's a ${wettest.rainPct}% chance of rain around ${hourLabel(wettest.t)}.`
  const temps = window.map((h) => h.tempC)
  if (Math.max(...temps) >= 30) return "It's a hot one. Bring water."
  if (Math.min(...temps) <= 8) return "It'll be cold out. Wear layers."
  return null
}

export function hourLabel(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric' })
}
