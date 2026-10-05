/**
 * Gemini, through our Cloudflare Worker (which holds the key).
 *
 * Privacy: on Gemini's free tier Google may use what we send to improve its
 * products, so we only ever send place names, categories, rough distances and
 * visit counts. Never coordinates, never a GPS trail.
 *
 * Every call is optional. Without VITE_API_URL, or when the free quota is used
 * up, callers get `null` and fall back to Wander's own rule-based picks.
 */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')

export const aiAvailable = !!API_URL

export interface RankCandidate {
  id: string
  name: string
  category: string
  /** e.g. "1.2 km" */
  distance: string
  visits: number
  open?: string
}

export interface RankInput {
  mood: string
  /** e.g. "light rain, 14°C" */
  weather?: string
  /** your most-visited kinds of place, e.g. ["cafe ×12", "park ×7"] */
  taste: string[]
  candidates: RankCandidate[]
  count: number
}

async function call<T>(task: string, data: unknown, signal?: AbortSignal): Promise<T | null> {
  if (!API_URL) return null
  try {
    const res = await fetch(`${API_URL}/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, data }),
      signal,
    })
    if (!res.ok) return null // 429 (quota), 5xx, or AI not configured on the Worker
    return (await res.json()) as T
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    return null
  }
}

/** Gemini picks the best few real candidates and says why, in under 12 words each. */
export async function aiRank(input: RankInput, signal?: AbortSignal) {
  const out = await call<{ picks: { id: string; reason: string }[] }>('rank', input, signal)
  const ids = new Set(input.candidates.map((c) => c.id))
  // It may only choose from what we gave it; anything else is dropped.
  return out?.picks?.filter((p) => ids.has(p.id) && typeof p.reason === 'string') ?? null
}

export interface WrappedInput {
  period: string
  visits: number
  places: number
  newPlaces: number
  newAreas: string[]
  topPlace?: string
  topCategory?: string
  walkedKm: number
  streakWeeks: number
}

/** A short, warm recap paragraph for Wander Wrapped. */
export async function aiWrapped(input: WrappedInput, signal?: AbortSignal) {
  const out = await call<{ text: string }>('wrapped', input, signal)
  return out?.text?.trim() || null
}
