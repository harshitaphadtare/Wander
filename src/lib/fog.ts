import type { Walk } from './db'
import type { LatLng } from './geo'
import { contains, type Suburb } from './suburb'

/**
 * Explored % (fog of war). The area is cut into hexagons (~110 m across in a
 * normal suburb); a hex clears when you've checked in within it (or next to
 * it), or walked through it on a planned walk. Everything runs on the phone.
 *
 * With a suburb boundary we measure exactly that suburb. Without one (offline,
 * or Nominatim didn't answer) we fall back to a 1.5 km circle around the centre.
 */

const BASE_HEX_M = 110 // centre-to-corner
const MAX_CELLS = 4000 // keep huge rural suburbs fast by using bigger hexes
export const FOG_RADIUS_M = 1500
const DRAW_RADIUS_M = 2600 // circle mode: a bit more mist than we measure, so the edge fades
const M_PER_DEG = 111_320

interface Frame {
  origin: LatLng
  kx: number // metres per degree of longitude here
}

const frame = (origin: LatLng): Frame => ({ origin, kx: M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180) })
const toXY = (f: Frame, p: LatLng) => ({ x: (p.lng - f.origin.lng) * f.kx, y: (p.lat - f.origin.lat) * M_PER_DEG })
const toLngLat = (f: Frame, x: number, y: number): [number, number] => [f.origin.lng + x / f.kx, f.origin.lat + y / M_PER_DEG]

/** Pointy-top axial hex coordinates for a point (metres). */
function hexOf(x: number, y: number, size: number): [number, number] {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size
  const r = ((2 / 3) * y) / size
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

const hexCenter = (q: number, r: number, size: number) => ({ x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r })

function hexRing(f: Frame, q: number, r: number, size: number): [number, number][] {
  const c = hexCenter(q, r, size)
  const ring: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 30) * Math.PI) / 180
    // Slightly oversized so neighbouring hexes overlap and no hairline seams show.
    ring.push(toLngLat(f, c.x + size * 1.02 * Math.cos(a), c.y + size * 1.02 * Math.sin(a)))
  }
  ring.push(ring[0])
  return ring
}

export interface FogResult {
  data: GeoJSON.FeatureCollection
  /** 0–100 */
  percent: number
  explored: number
  total: number
  /** the suburb measured, or null in circle mode */
  suburb: string | null
}

export function computeFog(center: LatLng, visited: LatLng[], walks: Walk[], suburb: Suburb | null = null): FogResult {
  // Hexes snap to a fixed grid (origin rounded to 0.05°) so the same street is
  // always the same hex, wherever you open the fog from.
  const f = frame({ lat: Math.round(center.lat * 20) / 20, lng: Math.round(center.lng * 20) / 20 })

  // Big suburbs get bigger hexes so we never draw more than ~MAX_CELLS.
  let size = BASE_HEX_M
  if (suburb) {
    const [w, s, e, n] = suburb.bbox
    const bboxM2 = (e - w) * f.kx * (n - s) * M_PER_DEG
    size = Math.max(BASE_HEX_M, Math.sqrt(bboxM2 / (2.6 * MAX_CELLS)))
  }

  const key = (q: number, r: number) => `${q},${r}`
  const cleared = new Set<string>()
  const clear = (p: LatLng, neighbours: boolean) => {
    const { x, y } = toXY(f, p)
    const [q, r] = hexOf(x, y, size)
    cleared.add(key(q, r))
    if (neighbours) for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) cleared.add(key(q + dq, r + dr))
  }
  for (const p of visited) clear(p, true)
  for (const w of walks) {
    if (w.deleted || !(w.arrived || w.endedAt)) continue
    const path = w.path ?? [[w.from.lng, w.from.lat], [w.to.lng, w.to.lat]]
    // Sample along the line so each hex we pass through clears.
    for (let i = 1; i < path.length; i++) {
      const a = toXY(f, { lng: path[i - 1][0], lat: path[i - 1][1] })
      const b = toXY(f, { lng: path[i][0], lat: path[i][1] })
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (size / 3)))
      for (let s = 0; s <= steps; s++) {
        const [q, r] = hexOf(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps, size)
        cleared.add(key(q, r))
      }
    }
  }

  const features: GeoJSON.Feature[] = []
  let total = 0
  let explored = 0
  const visit = (q: number, r: number, inside: boolean, opacity: number) => {
    const isClear = cleared.has(key(q, r))
    if (inside) {
      total++
      if (isClear) explored++
    }
    if (!isClear && opacity > 0) {
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [hexRing(f, q, r, size)] }, properties: { o: opacity } })
    }
  }

  if (suburb) {
    // Every hex whose centre is inside the boundary.
    const [w, s, e, n] = suburb.bbox
    const sw = toXY(f, { lng: w, lat: s })
    const ne = toXY(f, { lng: e, lat: n })
    const [q0, r0] = hexOf(sw.x, sw.y, size)
    const [q1, r1] = hexOf(ne.x, ne.y, size)
    const rMin = Math.min(r0, r1) - 1
    const rMax = Math.max(r0, r1) + 1
    for (let r = rMin; r <= rMax; r++) {
      // Axial q shifts by r/2 per row, so widen the q range accordingly.
      const qMin = Math.min(q0, q1) - Math.ceil((rMax - rMin) / 2) - 1
      const qMax = Math.max(q0, q1) + Math.ceil((rMax - rMin) / 2) + 1
      for (let q = qMin; q <= qMax; q++) {
        const h = hexCenter(q, r, size)
        if (h.x < sw.x - size || h.x > ne.x + size || h.y < sw.y - size || h.y > ne.y + size) continue
        const [lng, lat] = toLngLat(f, h.x, h.y)
        if (contains(suburb.geometry, lng, lat)) visit(q, r, true, 1)
      }
    }
    features.push({ type: 'Feature', geometry: suburb.geometry, properties: { kind: 'edge' } })
  } else {
    const c = toXY(f, center)
    const [cq, cr] = hexOf(c.x, c.y, size)
    const span = Math.ceil(DRAW_RADIUS_M / (size * 1.5)) + 1
    for (let dq = -span * 2; dq <= span * 2; dq++) {
      for (let dr = -span; dr <= span; dr++) {
        const q = cq + dq
        const r = cr + dr
        const h = hexCenter(q, r, size)
        const d = Math.hypot(h.x - c.x, h.y - c.y)
        if (d > DRAW_RADIUS_M) continue
        // Mist thins towards the edge so it fades out instead of ending in a hard line.
        const edge = Math.max(0, Math.min(1, (DRAW_RADIUS_M - d) / (DRAW_RADIUS_M - FOG_RADIUS_M)))
        visit(q, r, d <= FOG_RADIUS_M, d <= FOG_RADIUS_M ? 1 : edge)
      }
    }
  }

  return {
    data: { type: 'FeatureCollection', features },
    percent: total ? Math.round((explored / total) * 1000) / 10 : 0,
    explored,
    total,
    suburb: suburb?.name ?? null,
  }
}
