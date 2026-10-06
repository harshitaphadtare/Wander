import { CalendarHeart, ChevronRight, Flame, Gift, Map as MapIcon, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import type { Visit } from '../lib/db'
import type { LatLng } from '../lib/geo'
import { weeklyStreak } from '../lib/streak'
import type { WrappedPeriod } from '../lib/wrapped'
import { CountUp } from '../ui/bits'
import { ExploreNext } from './ExploreSheet'
import type { TilePois } from '../lib/explore'

interface Props {
  visits: Visit[]
  places: PlaceWithStats[]
  at: LatLng | null
  tiles?: TilePois
  onHeatmap(): void
  onExplored(): void
  onRecap(period: WrappedPeriod): void
  onFocus(at: LatLng): void
  onWalk: Parameters<typeof ExploreNext>[0]['onWalk']
  onSave: Parameters<typeof ExploreNext>[0]['onSave']
}

function LinkRow({ icon: Icon, title, text, onClick, i }: { icon: LucideIcon; title: string; text: string; onClick(): void; i: number }) {
  return (
    <motion.button
      className="heat-link"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + i * 0.05 }}
    >
      <span className="heat-link-icon" aria-hidden>
        <Icon size={18} strokeWidth={2.3} />
      </span>
      <span className="row-text">
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <ChevronRight size={18} strokeWidth={2.2} aria-hidden />
    </motion.button>
  )
}

/**
 * Every "how am I doing" view in one place: the streak, the two map views
 * (heatmap, explored %), the recaps, and the bigger month / year adventures.
 */
export default function YourMap({ visits, places, at, tiles, onHeatmap, onExplored, onRecap, onFocus, onWalk, onSave }: Props) {
  const streak = useMemo(() => weeklyStreak(visits), [visits])
  const hasVisits = visits.length > 0

  return (
    <>
      {hasVisits && (
        <motion.div className="streak-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="streak-main">
            <strong className="display num">
              <CountUp value={streak.weeks} />
            </strong>
            <span className="row-text">
              <strong>{streak.weeks === 1 ? 'week' : 'weeks'} of somewhere new</strong>
              <small>
                {streak.thisWeek
                  ? 'This week’s done. Nice.'
                  : streak.weeks
                    ? 'Visit one new place this week to keep it going.'
                    : 'Visit a new place this week to start a streak.'}
                {streak.best > streak.weeks ? ` Best: ${streak.best}.` : ''}
              </small>
            </span>
          </div>
          <div className="streak-weeks" aria-label="Last 8 weeks">
            {streak.recent.map((on, i) => (
              <motion.span
                key={i}
                className={`${on ? 'on' : ''} ${i === 7 ? 'now' : ''}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1 + i * 0.03, type: 'spring', stiffness: 500, damping: 26 }}
              />
            ))}
          </div>
        </motion.div>
      )}

      <section className="your-map-links">
        <div className="list-label">On the map</div>
        <LinkRow i={0} icon={Flame} title="Where you go" text="A heatmap of the places you spend time" onClick={onHeatmap} />
        <LinkRow i={1} icon={MapIcon} title="How much you’ve explored" text="The share of your suburb you’ve been around" onClick={onExplored} />
      </section>

      {hasVisits && (
        <section className="your-map-links">
          <div className="list-label">Recaps</div>
          <LinkRow i={2} icon={Gift} title="Monthly recap" text="Your month in places" onClick={() => onRecap('month')} />
          <LinkRow i={3} icon={CalendarHeart} title="Year recap" text="Your year in places" onClick={() => onRecap('year')} />
        </section>
      )}

      {at && (
        <ExploreNext
          at={at}
          places={places}
          tiles={tiles}
          periods={['month', 'year']}
          label="Bigger adventures"
          onFocus={onFocus}
          onWalk={onWalk}
          onSave={onSave}
        />
      )}
    </>
  )
}
