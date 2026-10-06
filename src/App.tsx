import simplify from '@turf/simplify'
import { lineString } from '@turf/helpers'
import { LocateFixed } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Dock, { type Tab } from './components/Dock'
import ExploreSheet, { type ExploreShow } from './components/ExploreSheet'
import FogBar, { type MapMode } from './components/FogBar'
import HeatBar from './components/HeatBar'
import MapView, { type MapHandle, type Padding, type StopMarker } from './components/MapView'
import NearbyPrompt, { DwellPrompt } from './components/NearbyPrompt'
import PickPlaceSheet, { type PickChoice } from './components/PickPlaceSheet'
import { ResultSheet, SavedPlaceSheet } from './components/PlaceSheet'
import SearchBar from './components/SearchBar'
import SettingsPanel from './components/SettingsPanel'
import WalkBanner from './components/WalkBanner'
import VisitSheet from './components/VisitSheet'
import WalkSheet, { stopColor } from './components/WalkSheet'
import WrappedSheet from './components/WrappedSheet'
import YouSheet, { type YouSection } from './components/YouSheet'
import './features.css'
import { useActiveWalk } from './hooks/useActiveWalk'
import { useAutoDetect } from './hooks/useAutoDetect'
import { useLists, usePinPhotos, usePlaces, useVisits, useWalks, type PlaceWithStats } from './hooks/useData'
import { useGeolocation } from './hooks/useGeolocation'
import { useWalkPlanner, type WalkTarget } from './hooks/useWalkPlanner'
import { DESKTOP_QUERY } from './hooks/useMedia'
import { distanceM, formatDistance, geoErrorMessage, getCurrentPosition, type LatLng } from './lib/geo'
import type { Route } from './lib/routing'
import { computeFog } from './lib/fog'
import { suburbAt, type Suburb } from './lib/suburb'
import { heatFor } from './lib/heat'
import { weeklyStreak } from './lib/streak'
import type { WrappedPeriod } from './lib/wrapped'
import { periodStart, type Period } from './lib/periods'
import { levelFor } from './lib/levels'
import type { PhotonPlace } from './lib/photon'
import {
  countVisits,
  deleteVisit,
  endVisit,
  findNearbyPlaces,
  finishWalk,
  lastVisitTo,
  logVisit,
  SAME_PLACE_RADIUS_M,
  savePlace,
  startWalk,
  type PlaceInput,
} from './lib/places'
import Celebration, { type CelebrationData } from './ui/Celebration'
import { useConfirm } from './ui/Confirm'
import Toast, { type ToastMessage } from './ui/Toast'

type SheetState =
  | { type: 'place'; id: string }
  | { type: 'result'; result: PhotonPlace }
  | { type: 'pick'; mode: 'here' | 'pin'; at: LatLng; accuracy?: number }
  | { type: 'walk'; target: WalkTarget; origin: LatLng }
  /** The You tab: your places, journal, and progress ("Your map"). */
  | { type: 'you'; section: YouSection }
  | { type: 'explore' }
  /** `fresh`: just checked in, so the sheet leads with "add photos, a note, steps". */
  | { type: 'visit'; id: string; fresh?: boolean }
  | { type: 'wrapped'; period: WrappedPeriod }
  | { type: 'settings' }
  | null

const AUTO_KEY = 'wander:auto-detect'
/** The "You're at…" card shows within this distance of a saved place… */
const NEARBY_RADIUS_M = 70
/** …unless you checked in there recently. */
const NEARBY_QUIET_MS = 3 * 3_600_000

/** Keep the focused point visible above the bottom sheet / beside the side panel. */
function sheetPadding(open: boolean): Padding {
  if (!open) return { top: 0, bottom: 0, left: 0, right: 0 }
  return matchMedia(DESKTOP_QUERY).matches
    ? { top: 0, bottom: 0, left: 420, right: 0 }
    : // detail sheets are capped at 62dvh and sit at the bottom edge (the dock steps aside)
      { top: 76, bottom: Math.round(window.innerHeight * 0.62 + 30), left: 0, right: 0 }
}

/** Fit a whole route on screen, clear of the sheet / side panel. */
function routePadding(sheetOpen: boolean): Padding {
  if (matchMedia(DESKTOP_QUERY).matches) return { top: 90, bottom: 110, left: sheetOpen ? 450 : 60, right: 70 }
  if (!sheetOpen) return { top: 110, bottom: 190, left: 44, right: 44 }
  // Fit above the sheet as it actually is (offsetTop ignores its slide-in transform).
  const sheet = document.querySelector<HTMLElement>('.sheet')
  const covered = sheet ? window.innerHeight - sheet.offsetTop : window.innerHeight * 0.62
  return { top: 90, bottom: Math.round(covered + 28), left: 44, right: 44 }
}

/** Frame the heatmap below the floating heat bar and above the dock. */
function heatPadding(): Padding {
  if (matchMedia(DESKTOP_QUERY).matches) return { top: 220, bottom: 80, left: 80, right: 80 }
  return { top: 230, bottom: 170, left: 50, right: 50 }
}

/** A walk's route, thinned to ~100 points: enough to clear the fog along it, small enough to sync. */
function simplifiedPath(coords: [number, number][]): [number, number][] {
  if (coords.length < 3) return coords
  let tolerance = 0.00003
  let line = simplify(lineString(coords), { tolerance })
  while (line.geometry.coordinates.length > 100 && tolerance < 0.005) {
    tolerance *= 2
    line = simplify(lineString(coords), { tolerance })
  }
  return line.geometry.coordinates.map(([lng, lat]) => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5])
}

function sheetKey(s: NonNullable<SheetState>): string {
  if (s.type === 'place') return `place-${s.id}`
  if (s.type === 'result') return `result-${s.result.lat},${s.result.lng}`
  if (s.type === 'pick') return `pick-${s.at.lat},${s.at.lng}`
  if (s.type === 'walk') return `walk-${s.target.lat},${s.target.lng}`
  if (s.type === 'visit') return `visit-${s.id}`
  return s.type
}

export default function App() {
  const places = usePlaces()
  const visits = useVisits()
  const lists = useLists()
  const walks = useWalks()
  const pinPhotos = usePinPhotos()
  const geo = useGeolocation()
  const confirm = useConfirm()
  const map = useRef<MapHandle>(null)

  const [sheet, setSheet] = useState<SheetState>(null)
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [celebration, setCelebration] = useState<CelebrationData | null>(null)
  const [autoDetect, setAutoDetect] = useState(() => localStorage.getItem(AUTO_KEY) !== '0')
  const [dismissedNearby, setDismissedNearby] = useState<Set<string>>(new Set())
  /** You've stayed somewhere that isn't one of your places: offer a check-in rather than guessing a name. */
  const [dwellSpot, setDwellSpot] = useState<LatLng | null>(null)
  /** Shared by the Journal and the heatmap so they always show the same stretch of time. */
  const [period, setPeriod] = useState<Period>('week')
  const [heatOn, setHeatOn] = useState(false)
  /** Explored % mode, measured around where the map was when it opened. */
  const [fogAt, setFogAt] = useState<LatLng | null>(null)
  const [exploreShow, setExploreShow] = useState<ExploreShow>({ picks: [], loop: null })
  const [exploreCollapsed, setExploreCollapsed] = useState(false)
  /** Which part of the You tab was open last, so the tab reopens where you left it. */
  const [youSection, setYouSection] = useState<YouSection>('places')
  const pendingLocate = useRef(false)
  const tilePois = useCallback(
    (coords: [number, number][], radiusM: number) => map.current?.poisAlong(coords, radiusM) ?? Promise.resolve([]),
    [],
  )
  /** Named POIs from the map tiles already loaded: instant and offline. */
  const poisNear = useCallback(
    (at: LatLng, radiusM: number, classes: string[]) => map.current?.poisNear(at, radiusM, classes) ?? [],
    [],
  )
  const planner = useWalkPlanner(sheet?.type === 'walk' ? { target: sheet.target, origin: sheet.origin } : null, tilePois)
  const active = useActiveWalk(geo.fix)

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone })
  }, [])
  const clearToast = useCallback(() => setToast(null), [])
  const clearCelebration = useCallback(() => setCelebration(null), [])

  const here: LatLng | null = geo.fix ? { lat: geo.fix.lat, lng: geo.fix.lng } : null
  const allPlaces = useMemo(() => places ?? [], [places])

  const flyTo = useCallback((at: LatLng, sheetOpen = true, zoom?: number) => {
    map.current?.flyTo(at, { zoom, padding: sheetPadding(sheetOpen) })
  }, [])

  // Surface location errors once each.
  const lastGeoError = useRef<string | null>(null)
  useEffect(() => {
    if (geo.error && geo.error !== lastGeoError.current) notify(geo.error, 'error')
    lastGeoError.current = geo.error
  }, [geo.error, notify])

  // "Locate me" waits for the first fix if we didn't have one.
  useEffect(() => {
    if (geo.fix && pendingLocate.current) {
      pendingLocate.current = false
      setLocating(false)
      flyTo(geo.fix, false, 16)
    }
  }, [geo.fix, flyTo])

  const locateMe = () => {
    if (geo.fix) {
      flyTo(geo.fix, sheet !== null, 16)
      return
    }
    pendingLocate.current = true
    setLocating(true)
    geo.start()
  }

  /** Log a visit with sanity checks, then celebrate any level-up. `undo` offers an Undo on the confirmation. */
  const checkIn = async (placeId: string, name: string, at: LatLng, opts: { undo?: boolean } = {}) => {
    if (here) {
      const away = distanceM(here, at)
      if (
        away > 300 &&
        !(await confirm({
          title: `You're ${formatDistance(away)} away`,
          message: `Log a visit to ${name} anyway?`,
          confirmLabel: 'Log visit',
        }))
      )
        return
    }
    const last = await lastVisitTo(placeId)
    if (last && Date.now() - last.arrivedAt < 30 * 60_000) {
      const mins = Math.max(1, Math.round((Date.now() - last.arrivedAt) / 60_000))
      const ok = await confirm({
        title: 'Already checked in',
        message: `You checked in at ${name} ${mins} min ago. Log another visit?`,
        confirmLabel: 'Log another',
      })
      if (!ok) return
    }
    const before = await countVisits(placeId)
    const visit = await logVisit(placeId, 'check-in')
    const after = before + 1
    const [oldLevel, newLevel] = [levelFor(before), levelFor(after)]
    navigator.vibrate?.(20)
    if (newLevel.key !== oldLevel.key && after >= 2) {
      setCelebration({ id: Date.now(), level: newLevel, placeName: name, visits: after })
    }
    if (opts.undo) {
      setToast({
        id: Date.now(),
        text: `Checked in at ${name}`,
        tone: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            void deleteVisit(visit.id)
            setSheet(null)
            notify('Check-in undone')
          },
        },
      })
    } else if (newLevel.key === oldLevel.key || after < 2) {
      notify(`Checked in at ${name}`, 'success')
    }
    setDwellSpot(null)
    // Straight to the visit, so adding photos / a note / steps is the obvious next step.
    setSheet({ type: 'visit', id: visit.id, fresh: true })
  }

  const withBusy = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong', 'error')
    } finally {
      setBusy(false)
    }
  }

  const imHere = () =>
    withBusy(async () => {
      geo.start()
      let at: LatLng
      let accuracy: number
      const fresh = geo.fix && Date.now() - geo.fix.timestamp < 30_000 && geo.fix.accuracy < 150
      if (fresh) {
        at = { lat: geo.fix!.lat, lng: geo.fix!.lng }
        accuracy = geo.fix!.accuracy
      } else {
        notify('Finding you…')
        try {
          const pos = await getCurrentPosition()
          at = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          accuracy = pos.coords.accuracy
          clearToast()
        } catch (err) {
          notify(geoErrorMessage(err), 'error')
          return
        }
      }
      // Clearly at one of your places? Check straight in (with Undo) instead of asking.
      if (accuracy <= 50) {
        const [first, second] = await findNearbyPlaces(at, 40)
        if (first && (!second || second.distance > first.distance * 2 + 15)) {
          flyTo(first.place, true, 17)
          await checkIn(first.place.id, first.place.name, first.place, { undo: true })
          return
        }
      }
      setSheet({ type: 'pick', mode: 'here', at, accuracy })
      flyTo(at, true, 17)
    })

  const onPickChoice = (mode: 'here' | 'pin', choice: PickChoice) =>
    withBusy(async () => {
      const place = choice.kind === 'saved' ? choice.place : await savePlace(choice.input)
      if (mode === 'here') {
        await checkIn(place.id, place.name, place)
      } else {
        notify(`Added ${place.name} to Want to go`, 'success')
        setSheet({ type: 'place', id: place.id })
      }
    })

  const saveResult = (input: PlaceInput, andCheckIn: boolean) =>
    withBusy(async () => {
      const place = await savePlace(input)
      if (andCheckIn) await checkIn(place.id, place.name, place)
      else {
        notify(`Added ${place.name} to Want to go`, 'success')
        setSheet({ type: 'place', id: place.id })
      }
    })

  /** Your position for routing: a fresh fix, or ask the phone for one. */
  const currentPosition = async (): Promise<LatLng | null> => {
    if (geo.fix && Date.now() - geo.fix.timestamp < 60_000 && geo.fix.accuracy < 200) return { lat: geo.fix.lat, lng: geo.fix.lng }
    geo.start()
    notify('Finding you…')
    try {
      const pos = await getCurrentPosition()
      clearToast()
      return { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch (err) {
      notify(geoErrorMessage(err), 'error')
      return null
    }
  }

  const walkTo = (target: WalkTarget) =>
    withBusy(async () => {
      const origin = await currentPosition()
      if (!origin) return
      if (distanceM(origin, target) < 40) {
        notify("You're already there!", 'info')
        return
      }
      setSheet({ type: 'walk', target, origin })
    })

  const beginWalk = () =>
    withBusy(async () => {
      if (sheet?.type !== 'walk' || !planner.route) return
      const { target, origin } = sheet
      const stop = planner.stop
      // Tile-sourced places have no real OSM id; don't store the placeholder.
      const stopPlace = stop ? await savePlace({ ...stop, osmId: stop.osmId.startsWith('tile:') ? undefined : stop.osmId }) : null
      const walk = await startWalk({
        from: origin,
        to: { lat: target.lat, lng: target.lng, name: target.name },
        stopPlaceId: stopPlace?.id,
        distanceM: planner.route.distanceM,
        durationS: planner.route.durationS,
        startedAt: Date.now(),
        path: simplifiedPath(planner.route.coords),
      })
      active.begin({
        walkId: walk.id,
        target,
        stop: stop ? { name: stop.name, lat: stop.lat, lng: stop.lng, osmId: stop.osmId, category: stop.category } : undefined,
        route: planner.route,
        startedAt: walk.startedAt,
      })
      setSheet(null)
      geo.start()
      map.current?.fitRoute(planner.route.coords, routePadding(false))
      notify('Walk started. Lock your phone anytime; progress updates when you open Wander.', 'success')
    })

  const beginLoop = (loop: Route) =>
    withBusy(async () => {
      const [lng, lat] = loop.coords[0]
      const start = { lat, lng }
      const walk = await startWalk({
        from: start,
        to: { ...start, name: 'Loop' },
        distanceM: loop.distanceM,
        durationS: loop.durationS,
        startedAt: Date.now(),
        path: simplifiedPath(loop.coords),
      })
      active.begin({ walkId: walk.id, target: { name: 'Loop', ...start }, route: loop, startedAt: walk.startedAt, loop: true })
      setSheet(null)
      geo.start()
      map.current?.fitRoute(loop.coords, routePadding(false))
      notify('Loop started. Lock your phone anytime; progress updates when you open Wander.', 'success')
    })

  const endWalk = async () => {
    if (!active.walk) return
    const arrived = !!active.progress?.arrived
    if (
      !arrived &&
      !(await confirm({
        title: active.walk.loop ? 'End this loop?' : 'End this walk?',
        message: active.walk.loop ? "You're not back at the start yet." : "You haven't reached the destination yet.",
        confirmLabel: 'End walk',
      }))
    )
      return
    await finishWalk(active.walk.walkId, arrived)
    active.end()
  }

  const checkInOnArrival = () =>
    withBusy(async () => {
      if (!active.walk) return
      const t = active.walk.target
      const place = t.placeId ? allPlaces.find((p) => p.id === t.placeId) : await savePlace(t)
      await finishWalk(active.walk.walkId, true)
      active.end()
      if (place) await checkIn(place.id, place.name, place)
    })

  const openPlace = (p: PlaceWithStats) => {
    setSheet({ type: 'place', id: p.id })
    flyTo(p)
  }

  // ---- Auto-detect: stayed put for 10+ min while the app was open ----
  const onDwell = useCallback(
    async (at: LatLng, since: number): Promise<string | null> => {
      const place = (await findNearbyPlaces(at, SAME_PLACE_RADIUS_M))[0]?.place
      if (!place) {
        // Not one of your places. Guessing a name from the nearest POI used to log
        // things like the car park next door, so ask instead.
        setDwellSpot(at)
        return null
      }
      const last = await lastVisitTo(place.id)
      if (last && since - last.arrivedAt < 2 * 3_600_000) return null // already logged recently
      const visit = await logVisit(place.id, 'auto', since)
      notify(`Auto-logged a visit to ${place.name}`, 'success')
      return visit.id
    },
    [notify],
  )
  const onLeave = useCallback((visitId: string) => void endVisit(visitId), [])
  useAutoDetect(geo.fix, { enabled: autoDetect, onDwell, onLeave })

  const setAuto = (on: boolean) => {
    setAutoDetect(on)
    localStorage.setItem(AUTO_KEY, on ? '1' : '0')
    if (on) geo.start()
  }

  // ---- "You're at…" prompt: one-tap check-in when you open the app at a saved place ----
  const nearbyPlace = useMemo(() => {
    if (!geo.fix || geo.fix.accuracy > 100) return null
    const fix = geo.fix
    let best: { p: PlaceWithStats; d: number } | null = null
    for (const p of allPlaces) {
      const d = distanceM(fix, p)
      if (d <= NEARBY_RADIUS_M && (!best || d < best.d)) best = { p, d }
    }
    if (!best || dismissedNearby.has(best.p.id)) return null
    if (best.p.lastVisitAt && fix.timestamp - best.p.lastVisitAt < NEARBY_QUIET_MS) return null
    return best.p
  }, [geo.fix, allPlaces, dismissedNearby])

  // ---- Derived view state ----
  const selectedPlace = sheet?.type === 'place' ? allPlaces.find((p) => p.id === sheet.id) : undefined
  const marker = useMemo<LatLng | null>(() => {
    if (sheet?.type === 'result') return sheet.result
    if (sheet?.type === 'pick' && sheet.mode === 'pin') return sheet.at
    if (sheet?.type === 'walk' && !sheet.target.placeId) return sheet.target
    if (!sheet && active.walk && !active.walk.target.placeId) return active.walk.target
    return null
  }, [sheet, active.walk])

  const mapRoute =
    sheet?.type === 'walk'
      ? (planner.route?.coords ?? null)
      : sheet?.type === 'explore'
        ? (exploreShow.loop?.coords ?? null)
        : !sheet
          ? (active.walk?.route.coords ?? null)
          : null
  const [walkStopsShown, setWalkStopsShown] = useState(false)
  const stopMarkers = useMemo<StopMarker[]>(() => {
    if (sheet?.type === 'explore') {
      return exploreShow.picks.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, category: p.category, color: '#F2542D', closed: false }))
    }
    if (sheet?.type === 'walk') {
      // Every café along the way only once you've opened "Add a stop"; until then just your chosen one.
      const shown = walkStopsShown ? (planner.stops ?? []) : planner.stop ? [planner.stop] : []
      return shown.map((s) => ({
        id: s.osmId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        category: s.category,
        color: stopColor(s),
        closed: s.status === 'closed',
      }))
    }
    const st = !sheet && active.walk?.stop
    return st ? [{ id: st.osmId, name: st.name, lat: st.lat, lng: st.lng, category: st.category, color: '#F2542D', closed: false }] : []
  }, [sheet, planner.stops, planner.stop, walkStopsShown, active.walk, exploreShow])

  // Frame explore picks / a stroll loop as they arrive.
  useEffect(() => {
    if (sheet?.type !== 'explore') return
    // Minimised, the sheet is just a header, so the route can use most of the screen.
    const open = !exploreCollapsed
    if (exploreShow.loop) map.current?.fitRoute(exploreShow.loop.coords, routePadding(open))
    else if (exploreShow.picks.length > 1 && open) map.current?.fitRoute(exploreShow.picks.map((p) => [p.lng, p.lat]), routePadding(open))
    else if (exploreShow.picks[0] && open) flyTo(exploreShow.picks[0], true, 15)
  }, [exploreShow, exploreCollapsed, sheet?.type, flyTo])
  // Leaving Explore clears its pins and loop.
  useEffect(() => {
    if (sheet?.type !== 'explore') {
      setExploreShow((s) => (s.picks.length || s.loop ? { picks: [], loop: null } : s))
      setExploreCollapsed(false)
    }
  }, [sheet?.type])

  // Show the whole route (and refit when a stop reshapes it).
  useEffect(() => {
    if (sheet?.type === 'walk' && planner.route) map.current?.fitRoute(planner.route.coords, routePadding(true))
  }, [planner.route, sheet?.type])

  // A saved place that disappeared (deleted / synced away) closes its sheet.
  useEffect(() => {
    if (sheet?.type === 'place' && places && !selectedPlace) setSheet(null)
  }, [sheet, places, selectedPlace])

  // ---- Heatmap: where you spend time, for the chosen period ----
  const heat = useMemo(
    () => (heatOn ? heatFor(visits ?? [], new Map(allPlaces.map((p) => [p.id, p])), period) : null),
    [heatOn, visits, allPlaces, period],
  )
  // Frame it when it opens or the period changes (not on every live data tick).
  const heatCoords = useRef<[number, number][]>([])
  heatCoords.current = heat?.coords ?? []
  useEffect(() => {
    if (heatOn) map.current?.fitPoints(heatCoords.current, heatPadding())
  }, [heatOn, period])

  // The real suburb boundary around where you're looking (null = 1.5 km circle fallback).
  const [fogSuburb, setFogSuburb] = useState<{ at: LatLng; suburb: Suburb | null } | null>(null)
  useEffect(() => {
    if (!fogAt) return
    const ctrl = new AbortController()
    suburbAt(fogAt, ctrl.signal)
      .catch(() => null)
      .then((suburb) => {
        if (!ctrl.signal.aborted) setFogSuburb({ at: fogAt, suburb })
      })
    return () => ctrl.abort()
  }, [fogAt])
  const suburbReady = !!fogAt && fogSuburb?.at === fogAt
  const fog = useMemo(
    () =>
      fogAt && suburbReady
        ? computeFog(fogAt, allPlaces.filter((p) => p.visitCount > 0), walks ?? [], fogSuburb?.suburb ?? null)
        : null,
    [fogAt, suburbReady, fogSuburb, allPlaces, walks],
  )
  const openFog = () => {
    setSheet(null)
    setHeatOn(false)
    setFogAt(map.current?.getCenter() ?? here)
  }
  // Frame the whole suburb once its boundary arrives.
  useEffect(() => {
    const b = fogSuburb?.suburb?.bbox
    if (fogAt && fogSuburb?.at === fogAt && b) {
      map.current?.fitPoints(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        heatPadding(),
      )
    }
  }, [fogSuburb, fogAt])
  const setMapMode = (mode: MapMode) => (mode === 'fog' ? openFog() : openHeat())
  const streakWeeks = useMemo(() => weeklyStreak(visits ?? []).weeks, [visits])

  const openHeat = () => {
    setSheet(null)
    setFogAt(null)
    setHeatOn(true)
    // Don't open on an empty map: widen to the first period that has visits.
    const order: Period[] = ['week', 'month', 'year', 'all']
    const all = visits ?? []
    const from = order.indexOf(period)
    const firstWithData = order.slice(from).find((p) => all.some((v) => v.arrivedAt >= periodStart(p)))
    if (firstWithData) setPeriod(firstWithData)
  }
  // Opening any sheet (check in, a tab, a dropped pin) steps out of heat / fog mode.
  useEffect(() => {
    if (sheet) {
      setHeatOn(false)
      setFogAt(null)
    }
  }, [sheet])

  const close = () => setSheet(null)
  const tab: Tab | null =
    sheet?.type === 'explore' ? 'explore' : sheet?.type === 'you' || sheet?.type === 'settings' ? 'you' : null
  const mapMode = heatOn || !!fogAt
  const openYou = (section: YouSection = youSection) => {
    setYouSection(section)
    setSheet({ type: 'you', section })
  }
  const toggleTab = (t: Tab) => {
    if (tab === t) setSheet(null)
    else if (t === 'you') openYou()
    else setSheet({ type: 'explore' })
  }
  const showNearby = !!nearbyPlace && !sheet && !mapMode
  const showDwell = !showNearby && !!dwellSpot && !sheet && !mapMode

  const renderSheet = () => {
    switch (sheet?.type) {
      case 'place':
        return selectedPlace ? (
          <SavedPlaceSheet
            key={sheetKey(sheet)}
            place={selectedPlace}
            from={here}
            lists={lists ?? []}
            busy={busy}
            onVisit={(id) => setSheet({ type: 'visit', id })}
            onCheckIn={() => withBusy(() => checkIn(selectedPlace.id, selectedPlace.name, selectedPlace))}
            onWalk={() => walkTo({ ...selectedPlace, placeId: selectedPlace.id })}
            onClose={close}
            onDeleted={() => {
              notify('Place removed')
              close()
            }}
          />
        ) : null
      case 'result':
        return (
          <ResultSheet
            key={sheetKey(sheet)}
            result={sheet.result}
            from={here}
            busy={busy}
            onCheckIn={() => saveResult(sheet.result, true)}
            onSave={() => saveResult(sheet.result, false)}
            onWalk={() => walkTo(sheet.result)}
            onClose={close}
          />
        )
      case 'pick':
        return (
          <PickPlaceSheet
            key={sheetKey(sheet)}
            at={sheet.at}
            accuracy={sheet.accuracy}
            mode={sheet.mode}
            places={allPlaces}
            busy={busy}
            nearbyFromMap={poisNear}
            onChoose={(c) => onPickChoice(sheet.mode, c)}
            onClose={close}
          />
        )
      case 'walk':
        return <WalkSheet key={sheetKey(sheet)} target={sheet.target} planner={planner} onStart={beginWalk} onStopsShown={setWalkStopsShown} onClose={close} />
      case 'you':
        return (
          <YouSheet
            key="you"
            section={sheet.section}
            onSection={openYou}
            places={allPlaces}
            lists={lists ?? []}
            visits={visits ?? []}
            from={here}
            period={period}
            onPeriod={setPeriod}
            onPick={openPlace}
            onVisit={(id) => setSheet({ type: 'visit', id })}
            onSettings={() => setSheet({ type: 'settings' })}
            onClose={close}
            map={{
              at: here ?? map.current?.getCenter() ?? null,
              tiles: poisNear,
              onHeatmap: openHeat,
              onExplored: openFog,
              onRecap: (p) => setSheet({ type: 'wrapped', period: p }),
              onFocus: (at) => {
                setSheet(null)
                flyTo(at, false, 13)
              },
              onWalk: (t) => walkTo(t),
              onSave: async (input) => {
                await savePlace(input)
                notify(`Added ${input.name} to Want to go`, 'success')
              },
            }}
          />
        )
      case 'explore':
        return (
          <ExploreSheet
            key="explore"
            at={here ?? map.current?.getCenter() ?? null}
            approximate={!here}
            places={allPlaces}
            tiles={poisNear}
            onShow={setExploreShow}
            onCollapse={setExploreCollapsed}
            onFocus={(at) => flyTo(at, true, 16)}
            onWalk={(t) => walkTo(t)}
            onSave={async (input) => {
              await savePlace(input)
              notify(`Added ${input.name} to Want to go`, 'success')
            }}
            onStartLoop={beginLoop}
            onClose={close}
          />
        )
      case 'visit': {
        const v = visits?.find((x) => x.id === sheet.id)
        const p = v && allPlaces.find((x) => x.id === v.placeId)
        return p ? (
          <VisitSheet
            key={sheetKey(sheet)}
            visitId={sheet.id}
            place={p}
            fresh={!!sheet.fresh}
            notify={notify}
            onOpenPlace={() => openPlace(p)}
            onClose={close}
          />
        ) : null
      }
      case 'wrapped':
        return (
          <WrappedSheet
            key="wrapped"
            visits={visits ?? []}
            places={allPlaces}
            walks={walks ?? []}
            streakWeeks={streakWeeks}
            initial={sheet.period}
            onClose={() => openYou('map')}
          />
        )
      case 'settings':
        return (
          <SettingsPanel
            key="settings"
            placeCount={allPlaces.length}
            visitCount={visits?.length ?? 0}
            autoDetect={autoDetect}
            onAutoDetect={setAuto}
            notify={notify}
            onClose={() => openYou()}
          />
        )
      default:
        return null
    }
  }

  return (
    <div
      className={`app ${sheet ? 'has-sheet' : ''} ${sheet && !tab && sheet.type !== 'settings' ? 'has-detail' : ''} ${showNearby || showDwell ? 'has-nearby' : ''} ${mapMode ? 'has-heat' : ''}`}
    >
      <MapView
        ref={map}
        places={allPlaces}
        fix={geo.fix}
        marker={marker}
        selectedPlaceId={selectedPlace?.id ?? null}
        onPlaceClick={(id) => {
          setSheet({ type: 'place', id })
          const p = allPlaces.find((x) => x.id === id)
          if (p) flyTo(p)
        }}
        onPoiClick={(poi) => {
          // Already one of yours? Open that instead of a fresh copy.
          const saved = allPlaces.find((p) => distanceM(p, poi) < 40 && p.name.trim().toLowerCase() === poi.name.trim().toLowerCase())
          if (saved) {
            setSheet({ type: 'place', id: saved.id })
            flyTo(saved)
            return
          }
          // No real OSM id from the tiles, so it's matched by name and distance when saved.
          setSheet({ type: 'result', result: { name: poi.name, lat: poi.lat, lng: poi.lng, category: poi.category } })
          flyTo(poi)
        }}
        onLongPress={(at) => {
          setSheet({ type: 'pick', mode: 'pin', at })
          flyTo(at)
        }}
        route={mapRoute}
        heat={heat?.data ?? null}
        fog={fog?.data ?? null}
        pinPhotos={pinPhotos}
        stops={stopMarkers}
        selectedStopId={sheet?.type === 'walk' ? (planner.stop?.osmId ?? null) : null}
        onStopClick={(id) => {
          if (sheet?.type === 'explore') {
            const p = exploreShow.picks.find((x) => x.id === id)
            if (p) flyTo(p, true, 16)
            return
          }
          if (sheet?.type !== 'walk') return
          const s = planner.stops?.find((x) => x.osmId === id)
          if (s) planner.setStop(planner.stop?.osmId === id ? null : s)
        }}
      />
      <div className="map-vignette" aria-hidden />

      <AnimatePresence>
        {active.walk && active.progress && (
          <WalkBanner key="walk-banner" walk={active.walk} progress={active.progress} onCheckIn={checkInOnArrival} onEnd={endWalk} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {heat && (
          <HeatBar key="heat-bar" period={period} summary={heat} onPeriod={setPeriod} onMode={setMapMode} onClose={() => {
              // Back where you came from: Your map.
              setHeatOn(false)
              openYou('map')
            }}
          />
        )}
        {fog && fogAt && (
          <FogBar
            key="fog-bar"
            fog={fog}
            onMode={setMapMode}
            onClose={() => {
              setFogAt(null)
              openYou('map')
            }}
          />
        )}
      </AnimatePresence>

      {!active.walk && !mapMode && (
        <SearchBar
          places={allPlaces}
        near={() => here ?? map.current?.getCenter() ?? null}
        from={here}
        onPickSaved={openPlace}
        onPickResult={(r) => {
          setSheet({ type: 'result', result: r })
          flyTo(r)
        }}
        />
      )}

      <motion.button
        className={`fab locate glass ${geo.fix ? 'has-fix' : ''} ${locating ? 'is-locating' : ''}`}
        onClick={locateMe}
        aria-label="Show my location"
        whileTap={{ scale: 0.9 }}
      >
        <LocateFixed size={21} strokeWidth={2.2} />
      </motion.button>

      <AnimatePresence>
        {showNearby && (
          <NearbyPrompt
            key={nearbyPlace.id}
            place={nearbyPlace}
            onOpen={() => openPlace(nearbyPlace)}
            onCheckIn={() => withBusy(() => checkIn(nearbyPlace.id, nearbyPlace.name, nearbyPlace))}
            onDismiss={() => setDismissedNearby((s) => new Set(s).add(nearbyPlace.id))}
          />
        )}
        {showDwell && (
          <DwellPrompt
            key="dwell"
            onCheckIn={() => {
              setSheet({ type: 'pick', mode: 'here', at: dwellSpot, accuracy: geo.fix?.accuracy })
              flyTo(dwellSpot, true, 17)
              setDwellSpot(null)
            }}
            onDismiss={() => setDwellSpot(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">{renderSheet()}</AnimatePresence>

      <Dock tab={tab} busy={busy} onTab={toggleTab} onCheckIn={imHere} />

      <Toast toast={toast} onDone={clearToast} />
      <Celebration data={celebration} onDone={clearCelebration} />
    </div>
  )
}
