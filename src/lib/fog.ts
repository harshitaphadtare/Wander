import type { Walk } from './db'
import type { LatLng } from './geo'

/**
 * Explored % (fog of war). The area around you is cut into ~100 m hexagons;
 * a hex clears when you've checked in within it (or next to it), or walked
 * through it on a planned walk. Everything is worked out on the phone.
 */

const HEX_M = 110 // centre-to-corner
export const FOG_RADIUS_M = 1500 // the area we measure, around where you're looking
const DRAW_RADIUS_M = 2600 // a bit more mist than we measure, so the edge isn't a hard circle
const M_PER_DEG = 111_320

interface Frame {
  origin: LatLng
  kx: number // metres per degree of longitude here
}

const frame = (origin: LatLng): Frame => ({ origin, kx: M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180) })
const toXY = (f: Frame, p: LatLng) => ({ x: (p.lng - f.origin.lng) * f.kx, y: (p.lat - f.origin.lat) * M_PER_DEG })
const toLngLat = (f: Frame, x: number, y: number): [number, number] => [f.origin.lng + x / f.kx, f.origin.lat + y / M_PER_DEG]

/** Pointy-top axial hex coordinates for a point (metres). */
function hexOf(x: number, y: number): [number, number] {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / HEX_M
  const r = ((2 / 3) * y) / HEX_M
  // cube rounding
  let rx = Math.round(q)
  let rz = Math.round(r)
  const ry = Math.round(-q - r)
  const dx = Math.abs(rx - q)
  const dy = Math.abs(ry - (-q - r))
  const dz = Math.abs(rz - r)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy <= dz) rz = -rx - ry
  return [rx, rz]
}

function hexCenter(q: number, r: number) {
  return { x: HEX_M * Math.sqrt(3) * (q + r / 2), y: HEX_M * 1.5 * r }
}

function hexRing(f: Frame, q: number, r: number): [number, number][] {
  const c = hexCenter(q, r)
  const ring: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 30) * Math.PI) / 180
    // Slightly oversized so neighbouring hexes overlap and no hairline seams show.
    ring.push(toLngLat(f, c.x + HEX_M * 1.02 * Math.cos(a), c.y + HEX_M * 1.02 * Math.sin(a)))
  }
  ring.push(ring[0])
  return ring
}

export interface FogResult {
  data: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  /** 0–100, within FOG_RADIUS_M of the centre */
  percent: number
  explored: number
  total: number
}

/**
 * Hexes are snapped to a fixed global grid (origin rounded to 0.05°) so the
 * same street is always the same hex, wherever you open the fog from.
 */
export function computeFog(center: LatLng, visited: LatLng[], walks: Walk[]): FogResult {
  const f = frame({ lat: Math.round(center.lat * 20) / 20, lng: Math.round(center.lng * 20) / 20 })
  const key = (q: number, r: number) => `${q},${r}`

  const cleared = new Set<string>()
  const clear = (p: LatLng, neighbours: boolean) => {
    const { x, y } = toXY(f, p)
    const [q, r] = hexOf(x, y)
    cleared.add(key(q, r))
    if (neighbours) for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) cleared.add(key(q + dq, r + dr))
  }
  for (const p of visited) clear(p, true)
  for (const w of walks) {
    if (w.deleted || !(w.arrived || w.endedAt)) continue
    const path = w.path ?? [[w.from.lng, w.from.lat], [w.to.lng, w.to.lat]]
    // Sample every ~40 m along the line so each hex we pass through clears.
    for (let i = 1; i < path.length; i++) {
      const a = toXY(f, { lng: path[i - 1][0], lat: path[i - 1][1] })
      const b = toXY(f, { lng: path[i][0], lat: path[i][1] })
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 40))
      for (let s = 0; s <= steps; s++) {
        const [q, r] = hexOf(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps)
        cleared.add(key(q, r))
      }
    }
  }

  const c = toXY(f, center)
  const [cq, cr] = hexOf(c.x, c.y)
  const span = Math.ceil(DRAW_RADIUS_M / (HEX_M * 1.5)) + 1
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  let total = 0
  let explored = 0
  for (let dq = -span * 2; dq <= span * 2; dq++) {
    for (let dr = -span; dr <= span; dr++) {
      const q = cq + dq
      const r = cr + dr
      const h = hexCenter(q, r)
      const d = Math.hypot(h.x - c.x, h.y - c.y)
      if (d > DRAW_RADIUS_M) continue
      const isClear = cleared.has(key(q, r))
      if (d <= FOG_RADIUS_M) {
        total++
        if (isClear) explored++
      }
      if (!isClear) {
        // Mist thins towards the edge so it fades out instead of ending in a hard line.
        const edge = Math.max(0, Math.min(1, (DRAW_RADIUS_M - d) / (DRAW_RADIUS_M - FOG_RADIUS_M)))
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [hexRing(f, q, r)] }, properties: { o: d <= FOG_RADIUS_M ? 1 : edge } })
      }
    }
  }
  return {
    data: { type: 'FeatureCollection', features },
    percent: total ? Math.round((explored / total) * 1000) / 10 : 0,
    explored,
    total,
  }
}
