import {
  AlarmClock,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplet,
  Moon,
  Sun,
  Sunset,
  Umbrella,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import type { Timing, WalkPlanner } from '../hooks/useWalkPlanner'
import { useWeather } from '../hooks/useWeather'
import { duration, startOfDay, timeOfDay } from '../lib/format'
import type { LatLng } from '../lib/geo'
import { hourLabel, hoursBetween, SKY_LABEL, walkAdvice, type Sky, type WeatherHour } from '../lib/weather'
import { Segmented } from '../ui/bits'

type Mode = 'now' | 'leave' | 'arrive'

const SKY_ICON: Record<Sky, [day: LucideIcon, night: LucideIcon]> = {
  clear: [Sun, Moon],
  partly: [CloudSun, CloudMoon],
  cloudy: [Cloud, Cloud],
  fog: [CloudFog, CloudFog],
  drizzle: [CloudDrizzle, CloudDrizzle],
  rain: [CloudRain, CloudRain],
  snow: [CloudSnow, CloudSnow],
  storm: [CloudLightning, CloudLightning],
}

/** Within this much of "now", leaving counts as "leave now". */
const NOW_SLACK_MS = 90_000

/** "HH:MM" for <input type="time">. */
function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The next time the clock reads HH:MM (later today, or tomorrow once it's passed). */
function nextOccurrence(value: string, now: number): Date | null {
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  if (d.getTime() < now - 60_000) d.setDate(d.getDate() + 1)
  return d
}

/** A round time a little ahead: the default when you switch modes. */
function roundedAhead(now: number, aheadMin: number) {
  const step = 5 * 60_000
  return new Date(Math.ceil((now + aheadMin * 60_000) / step) * step)
}

/** "5:42 pm", or "tomorrow 5:42 pm" when it isn't today. */
function when(d: Date, now: number) {
  const time = timeOfDay(d.getTime())
  const days = Math.round((startOfDay(d.getTime()) - startOfDay(now)) / 86_400_000)
  if (days === 0) return time
  if (days === 1) return `tomorrow ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`
}

interface Props {
  planner: WalkPlanner
  /** where the forecast is for (the destination) */
  at: LatLng
}

export default function WalkTiming({ planner, at }: Props) {
  const { timing, setTiming, leaveAt, arriveAt, arriveBy, sunset, now } = planner
  const mode: Mode = timing.mode === 'sunset' ? 'arrive' : timing.mode

  const setMode = (m: Mode) => {
    if (m === mode) return
    if (m === 'now') setTiming({ mode: 'now' })
    else if (m === 'leave') setTiming({ mode: 'leave', at: roundedAhead(now, 15) })
    // Sunset is the classic "arrive by"; fall back to an hour from now.
    else setTiming(sunset ? { mode: 'sunset' } : { mode: 'arrive', at: roundedAhead(now, 60) })
  }

  return (
    <section className="timing">
      <Segmented<Mode>
        id="walk-timing"
        value={mode}
        onChange={setMode}
        options={[
          ['now', 'Leave now'],
          ['leave', 'Leave at'],
          ['arrive', 'Arrive by'],
        ]}
      />

      <AnimatePresence initial={false} mode="popLayout">
        {mode === 'leave' && timing.mode === 'leave' && (
          <Reveal key="leave">
            <div className="timing-row">
              <span>Leaving</span>
              <TimeField value={timing.at} label="Departure time" onChange={(v) => {
                const d = nextOccurrence(v, now)
                if (d) setTiming({ mode: 'leave', at: d })
              }} />
            </div>
          </Reveal>
        )}

        {mode === 'arrive' && (
          <Reveal key="arrive">
            <div className="timing-row">
              <div className="timing-chips">
                {sunset && (
                  <motion.button
                    className={`sun-chip ${timing.mode === 'sunset' ? 'is-on' : ''}`}
                    onClick={() => setTiming({ mode: 'sunset' })}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Sunset size={15} strokeWidth={2.4} /> Sunset · {timeOfDay(sunset.getTime())}
                  </motion.button>
                )}
                <TimeField
                  value={timing.mode === 'arrive' ? timing.at : null}
                  placeholder={arriveBy ?? undefined}
                  label="Arrival time"
                  onChange={(v) => {
                    const d = nextOccurrence(v, now)
                    if (d) setTiming({ mode: 'arrive', at: d })
                  }}
                />
              </div>
            </div>
            <LeaveByCard timing={timing} leaveAt={leaveAt} arriveAt={arriveAt} arriveBy={arriveBy} now={now} />
          </Reveal>
        )}
      </AnimatePresence>

      <WeatherStrip at={at} from={leaveAt.getTime()} to={arriveAt?.getTime() ?? null} sunset={sunset} />
    </section>
  )
}

function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="timing-reveal"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="timing-reveal-inner">{children}</div>
    </motion.div>
  )
}

function TimeField({
  value,
  placeholder,
  label,
  onChange,
}: {
  value: Date | null
  placeholder?: Date
  label: string
  onChange(v: string): void
}) {
  const shown = value ?? placeholder
  return (
    <label className={`time-field ${value ? 'is-on' : ''}`}>
      <input type="time" value={shown ? hhmm(shown) : ''} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </label>
  )
}

function LeaveByCard({
  timing,
  leaveAt,
  arriveAt,
  arriveBy,
  now,
}: {
  timing: Timing
  leaveAt: Date
  arriveAt: Date | null
  arriveBy: Date | null
  now: number
}) {
  if (!arriveAt || !arriveBy) {
    return (
      <div className="leave-by">
        <span className="sk-line" style={{ width: 120, height: 30 }} />
        <span className="sk-line" style={{ width: 170 }} />
      </div>
    )
  }
  const lead = leaveAt.getTime() - now
  const lateBy = arriveAt.getTime() - arriveBy.getTime()
  const late = lateBy > NOW_SLACK_MS
  const goal = timing.mode === 'sunset' ? 'sunset' : timeOfDay(arriveBy.getTime())

  let headline: string
  let detail: string
  if (late) {
    headline = 'Leave now'
    detail = `You'll arrive at ${timeOfDay(arriveAt.getTime())}, ${duration(lateBy)} after ${goal}.`
  } else if (lead <= NOW_SLACK_MS) {
    headline = 'Leave now'
    detail = `Right on time for ${goal}.`
  } else {
    headline = `Leave ${when(leaveAt, now)}`
    detail = `That's in ${duration(lead)}. You'll arrive ${timing.mode === 'sunset' ? 'right at sunset' : `by ${goal}`}.`
  }

  return (
    <div className={`leave-by ${late ? 'is-late' : ''}`}>
      <span className="leave-by-icon" aria-hidden>
        {timing.mode === 'sunset' ? <Sunset size={20} strokeWidth={2.2} /> : <AlarmClock size={20} strokeWidth={2.2} />}
      </span>
      <motion.span
        key={headline}
        className="leave-by-text"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <strong className="display">{headline}</strong>
        <small>{detail}</small>
      </motion.span>
    </div>
  )
}

function WeatherStrip({ at, from, to, sunset }: { at: LatLng; from: number; to: number | null; sunset: Date | null }) {
  const forecast = useWeather(at)
  const walkEnd = to ?? from
  const shown = useMemo(
    () => (Array.isArray(forecast) ? hoursBetween(forecast, Math.min(from, walkEnd), walkEnd + 2 * 3_600_000, 6) : []),
    [forecast, from, walkEnd],
  )
  const advice = useMemo(() => {
    if (!Array.isArray(forecast)) return null
    return walkAdvice(forecast.filter((h) => h.t + 3_600_000 > from && h.t <= walkEnd))
  }, [forecast, from, walkEnd])

  if (forecast === 'error') return <p className="hours-note">Weather is unavailable right now.</p>

  return (
    <div className="weather">
      <div className="list-label">Weather</div>
      <ul className="weather-strip" aria-label="Hourly forecast">
        {forecast === null
          ? [0, 1, 2, 3, 4, 5].map((k) => <li key={k} className="weather-hour skeleton" />)
          : shown.map((h, i) => (
              <HourCell
                key={h.t}
                hour={h}
                index={i}
                walking={h.t + 3_600_000 > from && h.t <= walkEnd}
                sunsetHere={!!sunset && sunset.getTime() >= h.t && sunset.getTime() < h.t + 3_600_000}
              />
            ))}
      </ul>
      <AnimatePresence>
        {advice && (
          <motion.p className="weather-advice" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Umbrella size={14} strokeWidth={2.4} /> {advice}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function HourCell({ hour, index, walking, sunsetHere }: { hour: WeatherHour; index: number; walking: boolean; sunsetHere: boolean }) {
  const [DayIcon, NightIcon] = SKY_ICON[hour.sky]
  const Icon = hour.isDay ? DayIcon : NightIcon
  return (
    <motion.li
      className={`weather-hour ${walking ? 'is-walk' : ''}`}
      title={SKY_LABEL[hour.sky]}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: index * 0.03 }}
    >
      <span className="weather-time">{sunsetHere ? <Sunset size={13} strokeWidth={2.4} aria-label="Sunset" /> : hourLabel(hour.t)}</span>
      <Icon size={20} strokeWidth={2} aria-label={SKY_LABEL[hour.sky]} />
      <span className="weather-temp">{Math.round(hour.tempC)}°</span>
      <span className={`weather-rain ${hour.rainPct >= 30 ? 'is-wet' : ''}`}>
        <Droplet size={10} strokeWidth={2.6} aria-hidden />
        {hour.rainPct}%
      </span>
    </motion.li>
  )
}
