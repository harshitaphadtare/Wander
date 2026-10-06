import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import { aiAvailable, aiWrapped } from '../lib/ai'
import { getMeta, setMeta, type Visit, type Walk } from '../lib/db'
import { computeWrapped, fallbackStory, type WrappedPeriod } from '../lib/wrapped'
import { CountUp, Segmented } from '../ui/bits'
import Sheet from '../ui/Sheet'

interface Props {
  visits: Visit[]
  places: PlaceWithStats[]
  walks: Walk[]
  streakWeeks: number
  initial: WrappedPeriod
  onClose(): void
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Wander Wrapped: your month or year, in numbers and a few kind words. */
export default function WrappedSheet({ visits, places, walks, streakWeeks, initial, onClose }: Props) {
  const [period, setPeriod] = useState<WrappedPeriod>(initial)
  const [offset, setOffset] = useState(0)
  const w = useMemo(() => computeWrapped(period, visits, places, walks, streakWeeks, offset), [period, visits, places, walks, streakWeeks, offset])
  const [story, setStory] = useState<{ key: string; text: string; ai: boolean } | null>(null)

  // One Gemini call per month/year, cached; past periods never change so they never re-ask.
  const storyKey = `wrapped:${period}:${w.key}:${w.visits}`
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const cached = await getMeta<{ text: string; ai: boolean } | null>(storyKey, null)
      if (cached) {
        if (!cancelled) setStory({ key: storyKey, ...cached })
        return
      }
      const fallback = fallbackStory(w)
      if (!cancelled) setStory({ key: storyKey, text: fallback, ai: false })
      if (!aiAvailable || !w.visits) return
      const text = await aiWrapped(w).catch(() => null)
      if (text) {
        await setMeta(storyKey, { text, ai: true })
        if (!cancelled) setStory({ key: storyKey, text, ai: true })
      }
    })()
    return () => {
      cancelled = true
    }
    // w is derived from storyKey's inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyKey])

  const maxDay = Math.max(1, ...w.byWeekday)

  return (
    <Sheet onClose={onClose} eyebrow="Your recap" title={w.label}>
      <div className="wrapped-top">
        <Segmented<WrappedPeriod>
          id="wrapped-period"
          value={period}
          onChange={(p) => {
            setPeriod(p)
            setOffset(0)
          }}
          options={[
            ['month', 'Month'],
            ['year', 'Year'],
          ]}
        />
        <div className="wrapped-nav">
          <button className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label={`Previous ${period}`}>
            <ChevronLeft size={17} />
          </button>
          <button className="icon-btn" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0} aria-label={`Next ${period}`}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${period}-${offset}`}
          className="wrapped"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="wrapped-hero">
            <span className="wrapped-glow" aria-hidden />
            <strong className="display">
              <CountUp value={w.newPlaces} />
            </strong>
            <span>new {w.newPlaces === 1 ? 'place' : 'places'} discovered</span>
          </div>

          <div className="wrapped-grid">
            <Stat value={w.visits} label="check-ins" delay={0.05} />
            <Stat value={w.places} label="places" delay={0.1} />
            {/* Planned walks if there were any, else the steps you logged, else nothing to brag about yet. */}
            {w.walkedKm >= 0.1 || !w.steps ? (
              <Stat value={w.walkedKm} label="km walked" delay={0.15} decimals />
            ) : (
              <Stat value={w.steps} label="steps" delay={0.15} compact />
            )}
            <Stat value={w.streakWeeks} label="week streak" delay={0.2} />
          </div>

          {w.topPlace && (
            <motion.div className="wrapped-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
              <small>Your place</small>
              <strong>{w.topPlace}</strong>
              <em>
                {w.topPlaceVisits} {w.topPlaceVisits === 1 ? 'visit' : 'visits'}
              </em>
            </motion.div>
          )}
          {w.newAreas.length > 0 && (
            <motion.div className="wrapped-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
              <small>New areas</small>
              <strong>{w.newAreas.join(', ')}</strong>
            </motion.div>
          )}
          {w.visits > 0 && (
            <motion.div className="wrapped-days" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
              <small>{w.busiestDay ? `You wander most on ${w.busiestDay}` : 'When you wander'}</small>
              <div className="wrapped-bars">
                {w.byWeekday.map((n, i) => (
                  <span key={i}>
                    <motion.i
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: Math.max(0.06, n / maxDay) }}
                      transition={{ delay: 0.4 + i * 0.04, type: 'spring', stiffness: 260, damping: 24 }}
                    />
                    <b>{DAYS[i]}</b>
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {story?.key === storyKey && (
              <motion.blockquote key={story.text} className="wrapped-story" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {story.text}
                {story.ai && (
                  <span className="ai-tag">
                    <Sparkles size={11} /> Written by AI from your stats
                  </span>
                )}
              </motion.blockquote>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </Sheet>
  )
}

function Stat({ value, label, delay, decimals, compact }: { value: number; label: string; delay: number; decimals?: boolean; compact?: boolean }) {
  return (
    <motion.div className="wrapped-stat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <strong className="display num">
        {compact && value >= 1000 ? (
          `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
        ) : decimals ? (
          value.toFixed(value < 10 ? 1 : 0)
        ) : (
          <CountUp value={value} />
        )}
      </strong>
      <small>{label}</small>
    </motion.div>
  )
}
