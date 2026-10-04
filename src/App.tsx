import { Flame, LocateFixed } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Dock, { type Tab } from './components/Dock'
import HeatBar from './components/HeatBar'
import JournalPanel from './components/JournalPanel'
import MapView, { type MapHandle, type Padding, type StopMarker } from './components/MapView'
import NearbyPrompt from './components/NearbyPrompt'
import PickPlaceSheet, { type PickChoice } from './components/PickPlaceSheet'
import { ResultSheet, SavedPlaceSheet } from './components/PlaceSheet'
import PlacesPanel from './components/PlacesPanel'
import SearchBar from './components/SearchBar'
import SettingsPanel from './components/SettingsPanel'
import WalkBanner from './components/WalkBanner'
import WalkSheet, { stopColor } from './components/WalkSheet'
import { useActiveWalk } from './hooks/useActiveWalk'
import { useAutoDetect } from './hooks/useAutoDetect'
import { usePlaces, useVisits, type PlaceWithStats } from './hooks/useData'
import { useGeolocation } from './hooks/useGeolocation'
import { useWalkPlanner, type WalkTarget } from './hooks/useWalkPlanner'
import { DESKTOP_QUERY } from './hooks/useMedia'
import { distanceM, formatDistance, geoErrorMessage, getCurrentPosition, type LatLng } from './lib/geo'
import { heatFor } from './lib/heat'
import { periodStart, type Period } from './lib/periods'
import { levelFor } from './lib/levels'
import { reverseGeocode, type PhotonPlace } from './lib/photon'
import {
  countVisits,
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
  | { type: 'places' }
  | { type: 'journal' }
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
    : // sheet is capped at 62dvh and sits ~92px above the bottom (dock); keep the pin + label above it
      { top: 76, bottom: Math.round(window.innerHeight * 0.62 + 110), left: 0, right: 0 }
}

/** Fit a whole route on screen, clear of the sheet / side panel. */
function routePadding(sheetOpen: boolean): Padding {
  if (matchMedia(DESKTOP_QUERY).matches) return { top: 90, bottom: 110, left: sheetOpen ? 450 : 60, right: 70 }
  return sheetOpen
    ? { top: 90, bottom: Math.round(window.innerHeight * 0.62 + 120), left: 44, right: 44 }
    : { top: 110, bottom: 190, left: 44, right: 44 }
}

/** Frame the heatmap below the floating heat bar and above the dock. */
function heatPadding(): Padding {
  if (matchMedia(DESKTOP_QUERY).matches) return { top: 220, bottom: 80, left: 80, right: 80 }
  return { top: 230, bottom: 170, left: 50, right: 50 }
}

function sheetKey(s: NonNullable<SheetState>): string {
  if (s.type === 'place') return `place-${s.id}`
  if (s.type === 'result') return `result-${s.result.lat},${s.result.lng}`
  if (s.type === 'pick') return `pick-${s.at.lat},${s.at.lng}`
  if (s.type === 'walk') return `walk-${s.target.lat},${s.target.lng}`
  return s.type
}

export default function App() {
  const places = usePlaces()
  const visits = useVisits()
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
  /** Shared by the Journal and the heatmap so they always show the same stretch of time. */
  const [period, setPeriod] = useState<Period>('week')
  const [heatOn, setHeatOn] = useState(false)
  const pendingLocate = useRef(false)
  const tilePois = useCallback(
    (coords: [number, number][], radiusM: number) => map.current?.poisAlong(coords, radiusM) ?? Promise.resolve([]),
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

  /** Log a visit with sanity checks, then celebrate any level-up. */
  const checkIn = async (placeId: string, name: string, at: LatLng) => {
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
    await logVisit(placeId, 'check-in')
    const after = before + 1
    const [oldLevel, newLevel] = [levelFor(before), levelFor(after)]
    navigator.vibrate?.(20)
    if (newLevel.key !== oldLevel.key && after >= 2) {
      setCelebration({ id: Date.now(), level: newLevel, placeName: name, visits: after })
    } else {
      notify(`Checked in at ${name}`, 'success')
    }
    setSheet({ type: 'place', id: placeId })
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
      setSheet({ type: 'pick', mode: 'here', at, accuracy })
      flyTo(at, true, 17)
    })

  const onPickChoice = (mode: 'here' | 'pin', choice: PickChoice) =>
    withBusy(async () => {
      const place = choice.kind === 'saved' ? choice.place : await savePlace(choice.input)
      if (mode === 'here') {
        await checkIn(place.id, place.name, place)
      } else {
        notify(`Saved ${place.name}`, 'success')
        setSheet({ type: 'place', id: place.id })
      }
    })

  const saveResult = (input: PlaceInput, andCheckIn: boolean) =>
    withBusy(async () => {
      const place = await savePlace(input)
      if (andCheckIn) await checkIn(place.id, place.name, place)
      else {
        notify(`Saved ${place.name}`, 'success')
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

  const endWalk = async () => {
    if (!active.walk) return
    const arrived = !!active.progress?.arrived
    if (
      !arrived &&
      !(await confirm({ title: 'End this walk?', message: "You haven't reached the destination yet.", confirmLabel: 'End walk' }))
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
      const nearby = await findNearbyPlaces(at, SAME_PLACE_RADIUS_M)
      let place = nearby[0]?.place
      if (place) {
        const last = await lastVisitTo(place.id)
        if (last && since - last.arrivedAt < 2 * 3_600_000) return null // already logged recently
      } else {
        let input: PlaceInput = { name: 'Unnamed spot', lat: at.lat, lng: at.lng }
        try {
          const close = (await reverseGeocode(at)).filter((p) => distanceM(at, p) <= SAME_PLACE_RADIUS_M)
          const poi = close.find((p) => p.category)
          if (poi) input = poi
          else if (close[0]) input = { ...input, name: `Spot near ${close[0].name}` }
        } catch {
          // Offline: keep the unnamed spot; it can be renamed later.
        }
        place = await savePlace(input)
      }
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

  const mapRoute = sheet?.type === 'walk' ? (planner.route?.coords ?? null) : !sheet ? (active.walk?.route.coords ?? null) : null
  const stopMarkers = useMemo<StopMarker[]>(() => {
    if (sheet?.type === 'walk') {
      return (planner.stops ?? []).map((s) => ({
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
  }, [sheet, planner.stops, active.walk])

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

  const openHeat = () => {
    setSheet(null)
    setHeatOn(true)
    // Don't open on an empty map: widen to the first period that has visits.
    const order: Period[] = ['week', 'month', 'year', 'all']
    const all = visits ?? []
    const from = order.indexOf(period)
    const firstWithData = order.slice(from).find((p) => all.some((v) => v.arrivedAt >= periodStart(p)))
    if (firstWithData) setPeriod(firstWithData)
  }
  // Opening any sheet (check in, a tab, a dropped pin) steps out of heat mode.
  useEffect(() => {
    if (sheet) setHeatOn(false)
  }, [sheet])

  const close = () => setSheet(null)
  const tab: Tab | null = sheet?.type === 'places' || sheet?.type === 'journal' ? sheet.type : null
  const toggleTab = (t: Tab) => setSheet(tab === t ? null : { type: t })
  const showNearby = !!nearbyPlace && !sheet && !heatOn

  const renderSheet = () => {
    switch (sheet?.type) {
      case 'place':
        return selectedPlace ? (
          <SavedPlaceSheet
            key={sheetKey(sheet)}
            place={selectedPlace}
            from={here}
            busy={busy}
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
            onChoose={(c) => onPickChoice(sheet.mode, c)}
            onClose={close}
          />
        )
      case 'walk':
        return <WalkSheet key={sheetKey(sheet)} target={sheet.target} planner={planner} onStart={beginWalk} onClose={close} />
      case 'places':
        return <PlacesPanel key="places" places={allPlaces} from={here} onPick={openPlace} onClose={close} />
      case 'journal':
        return (
          <JournalPanel
            key="journal"
            visits={visits ?? []}
            places={allPlaces}
            period={period}
            onPeriod={setPeriod}
            onPick={openPlace}
            onHeatmap={openHeat}
            onClose={close}
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
            onClose={close}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className={`app ${sheet ? 'has-sheet' : ''} ${showNearby ? 'has-nearby' : ''} ${heatOn ? 'has-heat' : ''}`}>
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
        onLongPress={(at) => {
          setSheet({ type: 'pick', mode: 'pin', at })
          flyTo(at)
        }}
        route={mapRoute}
        heat={heat?.data ?? null}
        stops={stopMarkers}
        selectedStopId={sheet?.type === 'walk' ? (planner.stop?.osmId ?? null) : null}
        onStopClick={(id) => {
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
          <HeatBar key="heat-bar" period={period} summary={heat} onPeriod={setPeriod} onClose={() => setHeatOn(false)} />
        )}
      </AnimatePresence>

      {!active.walk && !heatOn && (
        <SearchBar
          places={allPlaces}
        near={() => here ?? map.current?.getCenter() ?? null}
        from={here}
        onPickSaved={openPlace}
        onPickResult={(r) => {
          setSheet({ type: 'result', result: r })
          flyTo(r)
        }}
          onOpenSettings={() => setSheet(sheet?.type === 'settings' ? null : { type: 'settings' })}
          nearbyFromMap={(at, radiusM, classes) => map.current?.poisNear(at, radiusM, classes) ?? []}
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

      {!active.walk && (
        <motion.button
          className={`fab heat glass ${heatOn ? 'is-on' : ''}`}
          onClick={() => (heatOn ? setHeatOn(false) : openHeat())}
          aria-label={heatOn ? 'Hide heatmap' : 'Show heatmap'}
          aria-pressed={heatOn}
          whileTap={{ scale: 0.9 }}
        >
          <Flame size={21} strokeWidth={2.2} />
        </motion.button>
      )}

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
      </AnimatePresence>

      <AnimatePresence mode="wait">{renderSheet()}</AnimatePresence>

      <Dock tab={tab} busy={busy} onTab={toggleTab} onCheckIn={imHere} />

      <Toast toast={toast} onDone={clearToast} />
      <Celebration data={celebration} onDone={clearCelebration} />
    </div>
  )
}
