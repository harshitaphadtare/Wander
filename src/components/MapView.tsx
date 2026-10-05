import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 loads its worker from a separate file; let Vite bundle it and hand over the URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from 'react'
import { Camera } from 'lucide-react'
import { createPortal } from 'react-dom'
import { lineString, point } from '@turf/helpers'
import nearestPointOnLine from '@turf/nearest-point-on-line'
import type { PlaceWithStats } from '../hooks/useData'
import type { Fix } from '../hooks/useGeolocation'
import { distanceM, type LatLng } from '../lib/geo'
import type { OsmPoi } from '../lib/overpass'
import { categoryIcon } from '../ui/icons'

// OpenFreeMap: free vector tiles, no key, no limits. Liberty is the colourful style
// with cafés, restaurants and parks shown as icons, which is handy for exploring.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const DEFAULT_CENTER: [number, number] = [144.9631, -37.8136] // Melbourne CBD
const VIEW_KEY = 'wander:view'
const LONG_PRESS_MS = 550

maplibregl.setWorkerUrl(workerUrl)

export interface Padding {
  top: number
  bottom: number
  left: number
  right: number
}

export interface MapHandle {
  flyTo(at: LatLng, opts?: { zoom?: number; padding?: Padding }): void
  fitRoute(coords: [number, number][], padding: Padding): void
  /** Frame a set of [lng, lat] points (e.g. everywhere on the heatmap). */
  fitPoints(coords: [number, number][], padding: Padding): void
  /** Cafés/restaurants near a line, read from the map's own vector tiles (instant, no hours). */
  poisAlong(coords: [number, number][], radiusM: number): Promise<OsmPoi[]>
  /** Places of the given OpenMapTiles poi classes near a point, nearest first (from loaded tiles). */
  poisNear(at: LatLng, radiusM: number, classes: string[]): OsmPoi[]
  getCenter(): LatLng | null
}

/** A café/restaurant along a planned walk. */
export interface StopMarker {
  id: string
  name: string
  lat: number
  lng: number
  category: string
  color: string
  closed: boolean
}

interface Props {
  ref?: Ref<MapHandle>
  places: PlaceWithStats[]
  fix: Fix | null
  /** Temporary pin for a search result / dropped pin. */
  marker: LatLng | null
  selectedPlaceId: string | null
  onPlaceClick(id: string): void
  onLongPress(at: LatLng): void
  /** Walking route to draw, [lng, lat] pairs. */
  route?: [number, number][] | null
  stops?: StopMarker[]
  selectedStopId?: string | null
  onStopClick?(id: string): void
  /** Visit heatmap; while set, saved-place pins step aside. */
  heat?: GeoJSON.FeatureCollection | null
  /** Explored % mist: unexplored hexes. */
  fog?: GeoJSON.FeatureCollection | null
  /** Places with photos get their latest photo as the pin. */
  pinPhotos?: Map<string, { url: string; count: number }>
}

function savedView(): { center: [number, number]; zoom: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null')
    if (v && Array.isArray(v.center) && typeof v.zoom === 'number') return v
  } catch {
    /* ignore */
  }
  return null
}

/** Circle radius (px) that matches `meters` at every zoom level. */
function metersRadius(meters: number, lat: number): maplibregl.ExpressionSpecification {
  const metersPerPxAtZ0 = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 512
  const r0 = meters / metersPerPxAtZ0
  return ['interpolate', ['exponential', 2], ['zoom'], 0, r0, 22, r0 * 2 ** 22]
}

function accuracyData(fix: Fix | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fix ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [fix.lng, fix.lat] }, properties: {} }] : [],
  }
}

export default function MapView({
  ref,
  places,
  fix,
  marker,
  selectedPlaceId,
  onPlaceClick,
  onLongPress,
  route = null,
  stops = [],
  selectedStopId = null,
  onStopClick,
  heat = null,
  fog = null,
  pinPhotos,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const pins = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>())
  const meMarker = useRef<maplibregl.Marker | null>(null)
  const dropMarker = useRef<maplibregl.Marker | null>(null)
  const centeredOnUser = useRef(savedView() !== null)
  const fixRef = useRef(fix)
  const routeRef = useRef(route)
  const heatRef = useRef(heat)
  const fogRef = useRef(fog)
  const stopMarkers = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>())
  const [stopHosts, setStopHosts] = useState<Map<string, HTMLDivElement>>(new Map())
  // Bumped when pin host elements are added/removed so the portals re-render.
  const [pinHosts, setPinHosts] = useState<Map<string, HTMLDivElement>>(new Map())

  // Latest props for map event handlers, which are bound once at creation.
  const latest = useRef({ onPlaceClick, onLongPress, onStopClick })
  useEffect(() => {
    latest.current = { onPlaceClick, onLongPress, onStopClick }
    fixRef.current = fix
    routeRef.current = route
    heatRef.current = heat
    fogRef.current = fog
  })

  useImperativeHandle(ref, () => ({
    flyTo(at, opts) {
      const map = mapRef.current
      if (!map) return
      map.flyTo({
        center: [at.lng, at.lat],
        zoom: Math.max(opts?.zoom ?? 16, map.getZoom()),
        padding: opts?.padding ?? { top: 0, bottom: 0, left: 0, right: 0 },
        speed: 1.4,
        curve: 1.5,
        essential: true,
      })
    },
    fitRoute(coords, padding) {
      const map = mapRef.current
      if (!map || coords.length < 2) return
      const b = new maplibregl.LngLatBounds(coords[0], coords[0])
      for (const c of coords) b.extend(c)
      map.fitBounds(b, { padding, maxZoom: 17, duration: 900, essential: true })
    },
    async poisAlong(coords, radiusM) {
      const map = mapRef.current
      if (!map || coords.length < 2) return []
      // Let any fit-to-route animation start, then wait for its tiles.
      await new Promise((r) => setTimeout(r, 80))
      await new Promise<void>((resolve) => {
        if (!map.isMoving() && map.areTilesLoaded()) return resolve()
        map.once('idle', () => resolve())
        setTimeout(resolve, 5000)
      })
      return tilePoisAlong(map, coords, radiusM)
    },
    poisNear(at, radiusM, classes) {
      const map = mapRef.current
      if (!map) return []
      return tilePois(map, classes, ([lng, lat]) => distanceM(at, { lat, lng }), radiusM).sort(
        (a, b) => distanceM(at, a) - distanceM(at, b),
      )
    },
    fitPoints(coords, padding) {
      const map = mapRef.current
      if (!map || coords.length === 0) return
      const b = new maplibregl.LngLatBounds(coords[0], coords[0])
      for (const c of coords) b.extend(c)
      // Pulled back a little so a single spot still shows its neighbourhood.
      map.fitBounds(b, { padding, maxZoom: 15, duration: 1000, essential: true })
    },
    getCenter() {
      const c = mapRef.current?.getCenter()
      return c ? { lat: c.lat, lng: c.lng } : null
    },
  }))

  // Create the map once.
  useEffect(() => {
    const view = savedView()
    const map = new maplibregl.Map({
      container: container.current!,
      style: STYLE_URL,
      center: view?.center ?? DEFAULT_CENTER,
      zoom: view?.zoom ?? 13,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      fadeDuration: 200,
    })
    map.touchZoomRotate.disableRotation()
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __wanderMap: MLMap }).__wanderMap = map

    // Compact attribution starts expanded; collapse it to the small (i) button.
    map.once('load', () => {
      const attrib = container.current?.querySelector('.maplibregl-ctrl-attrib')
      if (attrib?.classList.contains('maplibregl-compact-show')) {
        attrib.querySelector<HTMLButtonElement>('.maplibregl-ctrl-attrib-button')?.click()
      }
    })

    // Add our accuracy-circle layer once the style is ready.
    map.on('style.load', () => {
      tuneBaseStyle(map)
      addRouteLayers(map, routeRef.current)
      addHeatLayer(map, heatRef.current)
      addFogLayer(map, fogRef.current)
      if (!map.getSource('me')) map.addSource('me', { type: 'geojson', data: accuracyData(fixRef.current) })
      if (!map.getLayer('me-accuracy')) {
        map.addLayer({
          id: 'me-accuracy',
          type: 'circle',
          source: 'me',
          paint: {
            'circle-color': '#2F7BF6',
            'circle-opacity': 0.1,
            'circle-stroke-color': '#2F7BF6',
            'circle-stroke-opacity': 0.25,
            'circle-stroke-width': 1,
            'circle-radius': 0,
          },
        })
      }
      syncAccuracy(map, fixRef.current)
    })

    // Zoom buckets drive which pin labels show (pure CSS).
    const updateZoomClass = () => {
      const z = map.getZoom()
      const el = container.current
      if (!el) return
      el.classList.toggle('z-mid', z >= 14)
      el.classList.toggle('z-high', z >= 16)
    }
    map.on('zoom', updateZoomClass)
    updateZoomClass()

    map.on('moveend', () => {
      const c = map.getCenter()
      localStorage.setItem(VIEW_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom() }))
    })

    // Long-press (touch) or right-click (mouse) to drop a pin.
    let pressTimer: ReturnType<typeof setTimeout> | undefined
    let pressStart: { x: number; y: number } | null = null
    let lastFired = 0
    const fire = (lngLat: maplibregl.LngLat) => {
      if (Date.now() - lastFired < 800) return
      lastFired = Date.now()
      latest.current.onLongPress({ lat: lngLat.lat, lng: lngLat.lng })
    }
    const cancel = () => {
      clearTimeout(pressTimer)
      pressStart = null
    }
    map.on('touchstart', (e) => {
      if (e.originalEvent.touches.length !== 1) return cancel()
      pressStart = { x: e.point.x, y: e.point.y }
      const lngLat = e.lngLat
      pressTimer = setTimeout(() => {
        navigator.vibrate?.(15)
        fire(lngLat)
      }, LONG_PRESS_MS)
    })
    map.on('touchmove', (e) => {
      if (!pressStart) return
      if (Math.hypot(e.point.x - pressStart.x, e.point.y - pressStart.y) > 10) cancel()
    })
    map.on('touchend', cancel)
    map.on('touchcancel', cancel)
    map.on('dragstart', cancel)
    map.on('zoomstart', cancel)
    map.on('contextmenu', (e) => fire(e.lngLat))

    const pinMap = pins.current
    const stopMap = stopMarkers.current
    return () => {
      cancel()
      map.remove()
      pinMap.clear()
      stopMap.clear()
      mapRef.current = null
    }
  }, [])

  // Keep one DOM marker per saved place; React renders the pin into it via a portal.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const ids = new Set(places.map((p) => p.id))
    let changed = false
    for (const [id, pin] of pins.current) {
      if (!ids.has(id)) {
        pin.marker.remove()
        pins.current.delete(id)
        changed = true
      }
    }
    for (const p of places) {
      const existing = pins.current.get(p.id)
      if (existing) {
        existing.marker.setLngLat([p.lng, p.lat])
        continue
      }
      const el = document.createElement('div')
      el.className = 'pin-host'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        latest.current.onPlaceClick(p.id)
      })
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map)
      pins.current.set(p.id, { marker: m, el })
      changed = true
    }
    if (changed) setPinHosts(new Map([...pins.current].map(([id, pin]) => [id, pin.el])))
  }, [places])

  // Selected pin sits on top of the others.
  useEffect(() => {
    for (const [id, host] of pinHosts) host.style.zIndex = id === selectedPlaceId ? '5' : ''
  }, [selectedPlaceId, pinHosts])

  // Your position: pulsing dot + accuracy halo. Centre on you the first time.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    syncAccuracy(map, fix)
    if (!fix) {
      meMarker.current?.remove()
      meMarker.current = null
      return
    }
    if (!meMarker.current) {
      const el = document.createElement('div')
      el.className = 'me'
      el.innerHTML = '<span class="me-pulse"></span><span class="me-dot"></span>'
      meMarker.current = new maplibregl.Marker({ element: el }).setLngLat([fix.lng, fix.lat]).addTo(map)
    } else {
      meMarker.current.setLngLat([fix.lng, fix.lat])
    }
    if (!centeredOnUser.current) {
      centeredOnUser.current = true
      map.jumpTo({ center: [fix.lng, fix.lat], zoom: 15 })
    }
  }, [fix])

  // Temporary pin for search results / dropped pins.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    dropMarker.current?.remove()
    dropMarker.current = null
    if (!marker) return
    const el = document.createElement('div')
    el.className = 'drop-pin'
    el.innerHTML = '<span class="drop-pin-head"></span><span class="drop-pin-shadow"></span>'
    dropMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([marker.lng, marker.lat]).addTo(map)
  }, [marker])

  // Walking route: draws itself in from start to finish.
  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource<GeoJSONSource>('route')
    if (!map || !src) return
    if (!route || route.length < 2) {
      src.setData(routeData(null))
      return
    }
    let frame = 0
    const start = performance.now()
    const DRAW_MS = 700
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / DRAW_MS)
      const eased = 1 - Math.pow(1 - k, 3)
      const n = Math.max(2, Math.ceil(route.length * eased))
      src.setData(routeData(route.slice(0, n)))
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [route])

  // Stop markers along the route (same portal approach as place pins).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const ids = new Set(stops.map((s) => s.id))
    let changed = false
    for (const [id, m] of stopMarkers.current) {
      if (!ids.has(id)) {
        m.marker.remove()
        stopMarkers.current.delete(id)
        changed = true
      }
    }
    for (const s of stops) {
      if (stopMarkers.current.has(s.id)) continue
      const el = document.createElement('div')
      el.className = 'stop-host'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        latest.current.onStopClick?.(s.id)
      })
      const m = new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map)
      stopMarkers.current.set(s.id, { marker: m, el })
      changed = true
    }
    if (changed) setStopHosts(new Map([...stopMarkers.current].map(([id, m]) => [id, m.el])))
  }, [stops])

  useEffect(() => {
    for (const [id, host] of stopHosts) host.style.zIndex = id === selectedStopId ? '4' : ''
  }, [selectedStopId, stopHosts])

  // Heatmap fades in over the map; the old data stays put while it fades out.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (heat) map.getSource<GeoJSONSource>('heat')?.setData(heat)
    if (map.getLayer('heat')) map.setPaintProperty('heat', 'heatmap-opacity', heat ? HEAT_OPACITY : 0)
  }, [heat])

  // Mist settles in or lifts; the old shape stays while it fades out.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (fog) map.getSource<GeoJSONSource>('fog')?.setData(fog)
    if (map.getLayer('fog')) map.setPaintProperty('fog', 'fill-opacity', fog ? FOG_OPACITY : 0)
    if (map.getLayer('fog-edge')) map.setPaintProperty('fog-edge', 'line-opacity', fog ? 0.75 : 0)
  }, [fog])

  return (
    <div ref={container} className={`map ${heat ? 'is-heat' : ''} ${fog ? 'is-fog' : ''}`}>
      {stops.map((s) => {
        const host = stopHosts.get(s.id)
        if (!host) return null
        const Icon = categoryIcon(s.category)
        return createPortal(
          <div
            className={`stop-pin ${s.closed ? 'is-closed' : ''} ${s.id === selectedStopId ? 'is-selected' : ''}`}
            style={{ '--c': s.color } as CSSProperties}
            role="button"
            aria-label={s.name}
          >
            <Icon size={13} strokeWidth={2.5} />
            <span className="stop-pin-label">{s.name}</span>
          </div>,
          host,
          s.id,
        )
      })}
      {places.map((p) => {
        const host = pinHosts.get(p.id)
        if (!host) return null
        const Icon = categoryIcon(p.category)
        const photo = pinPhotos?.get(p.id)
        return createPortal(
          <div
            className={`pin lvl-${p.level.key} ${photo ? 'has-photo' : ''} ${p.id === selectedPlaceId ? 'is-selected' : ''}`}
            style={{ '--c': p.level.color } as CSSProperties}
            role="button"
            aria-label={photo ? `${p.name}, ${photo.count} ${photo.count === 1 ? 'photo' : 'photos'}` : p.name}
          >
            {photo ? (
              <span className="pin-body pin-photo">
                <img src={photo.url} alt="" draggable={false} />
                <span className="pin-photo-count">
                  <Camera size={10} strokeWidth={2.8} />
                  {photo.count}
                </span>
              </span>
            ) : (
              <span className="pin-body">
                <Icon size={15} strokeWidth={2.4} />
              </span>
            )}
            <span className="pin-label">{p.name}</span>
          </div>,
          host,
          p.id,
        )
      })}
    </div>
  )
}

const FOOD_CLASSES = ['cafe', 'restaurant', 'fast_food', 'bakery', 'ice_cream', 'bar', 'beer']

/**
 * Liberty tweaks: flat buildings instead of 3D blocks, and a food layer so cafés
 * and restaurants show from neighbourhood zoom (Liberty hides most until z16–17).
 */
function tuneBaseStyle(map: MLMap) {
  if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', 'none')
  if (map.getLayer('building')) map.setLayerZoomRange('building', 13, 24)

  if (!map.getLayer('food-poi') && map.getSource('openmaptiles')) {
    // Added last, so its labels win collisions over the base POI layers.
    map.addLayer({
      id: 'food-poi',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 15,
      filter: ['all', ['match', ['get', 'class'], FOOD_CLASSES, true, false], ['has', 'name']],
      layout: {
        'icon-image': ['get', 'class'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.75, 18, 1],
        // Generous padding thins the icons out in dense areas like the CBD;
        // the most important places (lowest rank) win.
        'icon-padding': ['interpolate', ['linear'], ['zoom'], 15, 14, 18, 4],
        // Names only once you're zoomed in close.
        'text-field': ['step', ['zoom'], '', 16.8, ['coalesce', ['get', 'name_en'], ['get', 'name']]],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.75],
        'text-max-width': 7,
        'text-padding': 6,
        'text-optional': true,
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: {
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.75, 16.5, 1],
        'text-color': '#9a5a2e',
        'text-halo-color': 'rgba(255, 255, 255, 0.95)',
        'text-halo-width': 1.5,
      },
    })
  }
}

function syncAccuracy(map: MLMap, fix: Fix | null) {
  map.getSource<GeoJSONSource>('me')?.setData(accuracyData(fix))
  if (fix && map.getLayer('me-accuracy')) {
    map.setPaintProperty('me-accuracy', 'circle-radius', metersRadius(Math.min(fix.accuracy, 500), fix.lat))
  }
}

const TILE_CATEGORY: Record<string, string> = { beer: 'pub' }
const KNOWN_CATEGORIES = new Set(['cafe', 'restaurant', 'fast_food', 'bakery', 'ice_cream', 'pub', 'bar'])

function tilePoisAlong(map: MLMap, coords: [number, number][], radiusM: number): OsmPoi[] {
  const line = lineString(coords)
  return tilePois(
    map,
    FOOD_CLASSES,
    (c) => nearestPointOnLine(line, point(c), { units: 'meters' }).properties.dist ?? Infinity,
    radiusM,
  )
}

/** Named POIs of `classes` from the loaded vector tiles, kept when `distanceOf` ≤ radius. */
function tilePois(
  map: MLMap,
  classes: string[],
  distanceOf: (lngLat: [number, number]) => number,
  radiusM: number,
): OsmPoi[] {
  const features = map.querySourceFeatures('openmaptiles', {
    sourceLayer: 'poi',
    filter: ['match', ['get', 'class'], classes, true, false],
  })
  const seen = new Set<string>()
  const out: OsmPoi[] = []
  for (const f of features) {
    if (f.geometry.type !== 'Point') continue
    const p = f.properties as { name?: string; name_en?: string; class: string; subclass?: string }
    const name = p.name_en || p.name
    if (!name) continue
    const [lng, lat] = f.geometry.coordinates as [number, number]
    const key = `${name}|${lat.toFixed(4)}|${lng.toFixed(4)}` // same POI repeats across tile edges
    if (seen.has(key)) continue
    seen.add(key)
    if (distanceOf([lng, lat]) > radiusM) continue
    const category = p.subclass && KNOWN_CATEGORIES.has(p.subclass) ? p.subclass : (TILE_CATEGORY[p.class] ?? p.class)
    out.push({ osmId: `tile:${key}`, name, lat, lng, category })
  }
  return out
}

function routeData(coords: [number, number][] | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: coords ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }] : [],
  }
}

const HEAT_OPACITY = 0.88
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/**
 * Where you spend time: warm amber through the brand vermilion to a deep berry
 * at the hottest spots. Sits under the map labels so street names stay readable.
 */
function addHeatLayer(map: MLMap, data: GeoJSON.FeatureCollection | null) {
  if (!map.getSource('heat')) map.addSource('heat', { type: 'geojson', data: data ?? EMPTY })
  if (map.getLayer('heat')) return
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addLayer(
    {
      id: 'heat',
      type: 'heatmap',
      source: 'heat',
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'w'], 0, 0, 1, 0.6, 4, 1.4],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 16, 2.2],
        'heatmap-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 9, 20, 13, 34, 16, 52, 19, 96],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(255, 200, 110, 0)',
          0.12,
          'rgba(255, 200, 110, 0.45)',
          0.35,
          'rgba(255, 150, 60, 0.75)',
          0.6,
          '#F2542D',
          0.82,
          '#D6336C',
          1,
          '#8F1D5C',
        ],
        'heatmap-opacity': data ? HEAT_OPACITY : 0,
        'heatmap-opacity-transition': { duration: 600, delay: 0 },
      },
    },
    firstLabel,
  )
}

const FOG_OPACITY = ['*', 0.9, ['get', 'o']] as unknown as number

/** Unexplored hexes as soft mist, under the labels so street names stay readable. */
function addFogLayer(map: MLMap, data: GeoJSON.FeatureCollection | null) {
  if (!map.getSource('fog')) map.addSource('fog', { type: 'geojson', data: data ?? EMPTY })
  if (map.getLayer('fog')) return
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addLayer(
    {
      id: 'fog',
      type: 'fill',
      source: 'fog',
      filter: ['!=', ['get', 'kind'], 'edge'],
      paint: {
        'fill-color': '#e3e4e6',
        'fill-antialias': false,
        'fill-opacity': data ? FOG_OPACITY : 0,
        'fill-opacity-transition': { duration: 700, delay: 0 },
      },
    },
    firstLabel,
  )
  // The measured suburb's boundary, as a soft dashed outline.
  map.addLayer(
    {
      id: 'fog-edge',
      type: 'line',
      source: 'fog',
      filter: ['==', ['get', 'kind'], 'edge'],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#F2542D',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 3],
        'line-dasharray': [2, 1.5],
        'line-opacity': data ? 0.75 : 0,
      },
    },
    firstLabel,
  )
}

/** Route line sits above roads but below map labels. */
function addRouteLayers(map: MLMap, coords: [number, number][] | null) {
  if (!map.getSource('route')) map.addSource('route', { type: 'geojson', data: routeData(coords) })
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  if (!map.getLayer('route-casing')) {
    map.addLayer(
      {
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 17, 12] },
      },
      firstLabel,
    )
  }
  if (!map.getLayer('route-line')) {
    map.addLayer(
      {
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#F2542D', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 17, 7] },
      },
      firstLabel,
    )
  }
}
