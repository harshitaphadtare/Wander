/**
 * Wander API: a tiny Cloudflare Worker whose only job is to keep API keys out
 * of the front end. The app calls this; this calls openrouteservice (and, in a
 * later phase, Gemini) with the secret key.
 *
 * Routes:
 *   POST /route   { coordinates: [[lng, lat], ...] }  → { coordinates, distance, duration }
 *   POST /loop    { start: [lng, lat], length, seed }  → { coordinates, distance, duration }
 *   POST /ai      { task: 'rank' | 'wrapped', data }   → task-specific JSON (Gemini)
 *   GET  /health  → { ok: true }
 *
 * /ai builds its prompts here, from a fixed set of tasks, so the Worker can't be
 * used as a free general-purpose Gemini proxy by anyone who finds the URL.
 */

export interface Env {
  /** Secret: `npx wrangler secret put ORS_API_KEY` */
  ORS_API_KEY: string
  /** Secret: `npx wrangler secret put GEMINI_API_KEY` (Google AI Studio, free, no card) */
  GEMINI_API_KEY?: string
  /** Optional model override, e.g. "gemini-flash-lite-latest" */
  GEMINI_MODEL?: string
  /** Comma-separated origins allowed to call this API. `https://*.wander.pages.dev` style wildcards are OK. */
  ALLOWED_ORIGINS: string
}

const ORS_FOOT = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson'
const MAX_POINTS = 6

function originAllowed(origin: string, allowed: string): boolean {
  return allowed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((rule) => {
      if (!rule.includes('*')) return rule === origin
      const pattern = new RegExp('^' + rule.split('*').map(escapeRegExp).join('[a-z0-9-]+') + '$')
      return pattern.test(origin)
    })
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function validCoordinates(value: unknown): value is [number, number][] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= MAX_POINTS &&
    value.every(
      (c) =>
        Array.isArray(c) &&
        c.length === 2 &&
        typeof c[0] === 'number' &&
        typeof c[1] === 'number' &&
        Math.abs(c[0]) <= 180 &&
        Math.abs(c[1]) <= 90,
    )
  )
}

async function route(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: { coordinates?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors)
  }
  if (!validCoordinates(body.coordinates)) {
    return json({ error: `coordinates must be 2–${MAX_POINTS} [lng, lat] pairs` }, 400, cors)
  }

  const res = await fetch(ORS_FOOT, {
    method: 'POST',
    headers: {
      Authorization: env.ORS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/geo+json',
    },
    body: JSON.stringify({ coordinates: body.coordinates, instructions: false }),
  })

  if (res.status === 429) return json({ error: 'Daily routing limit reached' }, 429, cors)
  // ORS answers 404 when no route exists between the points (e.g. across water).
  if (res.status === 404) return json({ error: 'No walking route found' }, 404, cors)
  if (!res.ok) return json({ error: `Routing failed (${res.status})` }, 502, cors)

  const data = (await res.json()) as {
    features?: {
      geometry: { coordinates: [number, number][] }
      properties: { summary?: { distance?: number; duration?: number } }
    }[]
  }
  const feature = data.features?.[0]
  if (!feature) return json({ error: 'No walking route found' }, 404, cors)

  return json(
    {
      coordinates: feature.geometry.coordinates,
      distance: feature.properties.summary?.distance ?? 0,
      duration: feature.properties.summary?.duration ?? 0,
    },
    200,
    cors,
  )
}

async function loop(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: { start?: unknown; length?: unknown; seed?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors)
  }
  const start = body.start
  const length = Number(body.length)
  if (!validCoordinates([start, start]) || !(length >= 500 && length <= 20_000)) {
    return json({ error: 'start must be [lng, lat] and length 500–20000 m' }, 400, cors)
  }
  const res = await fetch(ORS_FOOT, {
    method: 'POST',
    headers: { Authorization: env.ORS_API_KEY, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
    body: JSON.stringify({
      coordinates: [start],
      instructions: false,
      options: { round_trip: { length: Math.round(length), points: 4, seed: Math.abs(Math.round(Number(body.seed) || 0)) % 90 } },
    }),
  })
  if (res.status === 429) return json({ error: 'Daily routing limit reached' }, 429, cors)
  if (!res.ok) return json({ error: `Routing failed (${res.status})` }, 502, cors)
  const data = (await res.json()) as {
    features?: { geometry: { coordinates: [number, number][] }; properties: { summary?: { distance?: number; duration?: number } } }[]
  }
  const f = data.features?.[0]
  if (!f) return json({ error: 'No loop found' }, 404, cors)
  return json(
    { coordinates: f.geometry.coordinates, distance: f.properties.summary?.distance ?? 0, duration: f.properties.summary?.duration ?? 0 },
    200,
    cors,
  )
}

// ---------------------------------------------------------------- Gemini ----

const clip = (v: unknown, n = 80) => String(v ?? '').slice(0, n)

function rankPrompt(d: Record<string, unknown>) {
  const candidates = (Array.isArray(d.candidates) ? d.candidates : []).slice(0, 20) as Record<string, unknown>[]
  const count = Math.min(5, Math.max(1, Number(d.count) || 3))
  const lines = candidates.map(
    (c) =>
      `- id=${clip(c.id, 24)} | ${clip(c.name)} | ${clip(c.category, 40)} | ${clip(c.distance, 12)} | visits: ${Number(c.visits) || 0}${c.open ? ` | ${clip(c.open, 30)}` : ''}`,
  )
  const taste = (Array.isArray(d.taste) ? d.taste : []).slice(0, 5).map((t) => clip(t, 30)).join(', ')
  return {
    prompt: [
      `You help someone explore their own city. Mood: ${clip(d.mood, 60)}. Weather: ${clip(d.weather, 40) || 'unknown'}.`,
      `Places they visit most: ${taste || 'not much history yet'}.`,
      `Choose the ${count} best places from this list ONLY (never invent places) and give each a warm reason under 12 words, plain English, no emoji, no exclamation marks:`,
      ...lines,
    ].join('\n'),
    schema: {
      type: 'OBJECT',
      properties: {
        picks: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['id', 'reason'] },
        },
      },
      required: ['picks'],
    },
  }
}

function wrappedPrompt(d: Record<string, unknown>) {
  const areas = (Array.isArray(d.newAreas) ? d.newAreas : []).slice(0, 6).map((a) => clip(a, 40)).join(', ')
  const facts = [
    `Period: ${clip(d.period, 30)}`,
    `Check-ins: ${Number(d.visits) || 0}`,
    `Different places: ${Number(d.places) || 0}`,
    `First-time places: ${Number(d.newPlaces) || 0}`,
    `New areas: ${areas || 'none'}`,
    `Top place: ${clip(d.topPlace) || 'none'}`,
    `Favourite kind of place: ${clip(d.topCategory, 40) || 'none'}`,
    `Km on planned walks: ${Number(d.walkedKm) || 0}`,
    `Weekly new-place streak: ${Number(d.streakWeeks) || 0} weeks`,
  ]
  return {
    prompt: [
      "Write a short, warm recap (2–3 sentences, under 60 words) of someone's month or year exploring their city, like a friend would.",
      "Use only these facts, don't invent any. Second person, no emoji, no exclamation marks, no headings.",
      ...facts,
    ].join('\n'),
    schema: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] },
  }
}

async function ai(req: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ error: 'AI is not configured' }, 501, cors)
  const raw = await req.text()
  if (raw.length > 12_000) return json({ error: 'Request too large' }, 413, cors)
  let body: { task?: string; data?: Record<string, unknown> }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON' }, 400, cors)
  }
  const data = body.data ?? {}
  const built = body.task === 'rank' ? rankPrompt(data) : body.task === 'wrapped' ? wrappedPrompt(data) : null
  if (!built) return json({ error: 'Unknown task' }, 400, cors)

  const model = env.GEMINI_MODEL || 'gemini-flash-latest'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: built.prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: built.schema, temperature: 0.7, maxOutputTokens: 600 },
    }),
  })
  if (res.status === 429) return json({ error: 'AI quota used up for now' }, 429, cors)
  if (!res.ok) return json({ error: `AI failed (${res.status})` }, 502, cors)
  const out = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  try {
    return json(JSON.parse(text), 200, cors)
  } catch {
    return json({ error: 'AI returned something unreadable' }, 502, cors)
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? ''
    const allowed = originAllowed(origin, env.ALLOWED_ORIGINS ?? '')
    const cors: Record<string, string> = allowed
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          Vary: 'Origin',
        }
      : {}

    if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors })

    const { pathname } = new URL(req.url)
    if (pathname === '/health') return json({ ok: true, ors: !!env.ORS_API_KEY, ai: !!env.GEMINI_API_KEY }, 200, cors)

    // Browsers always send Origin on cross-site calls; block everyone else's sites.
    if (!allowed) return json({ error: 'Origin not allowed' }, 403)

    if (pathname === '/ai' && req.method === 'POST') return ai(req, env, cors)
    if (!env.ORS_API_KEY) return json({ error: 'ORS_API_KEY is not set' }, 500, cors)
    if (pathname === '/route' && req.method === 'POST') return route(req, env, cors)
    if (pathname === '/loop' && req.method === 'POST') return loop(req, env, cors)
    return json({ error: 'Not found' }, 404, cors)
  },
}
