/**
 * Wander API: a tiny Cloudflare Worker whose only job is to keep API keys out
 * of the front end. The app calls this; this calls openrouteservice (and, in a
 * later phase, Gemini) with the secret key.
 *
 * Routes:
 *   POST /route   { coordinates: [[lng, lat], ...] }  → { coordinates, distance, duration }
 *   GET  /health  → { ok: true }
 */

export interface Env {
  /** Secret: `npx wrangler secret put ORS_API_KEY` */
  ORS_API_KEY: string
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
    if (pathname === '/health') return json({ ok: true, ors: !!env.ORS_API_KEY }, 200, cors)

    // Browsers always send Origin on cross-site calls; block everyone else's sites.
    if (!allowed) return json({ error: 'Origin not allowed' }, 403)
    if (!env.ORS_API_KEY) return json({ error: 'ORS_API_KEY is not set' }, 500, cors)

    if (pathname === '/route' && req.method === 'POST') return route(req, env, cors)
    return json({ error: 'Not found' }, 404, cors)
  },
}
