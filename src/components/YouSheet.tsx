import { Settings } from 'lucide-react'
import { motion } from 'motion/react'
import type { ComponentProps } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import type { List, Visit } from '../lib/db'
import { plural } from '../lib/format'
import type { LatLng } from '../lib/geo'
import type { Period } from '../lib/periods'
import { Segmented } from '../ui/bits'
import Sheet from '../ui/Sheet'
import JournalBody from './JournalPanel'
import PlacesBody from './PlacesPanel'
import YourMap from './YourMap'

export type YouSection = 'places' | 'journal' | 'map'

interface Props {
  section: YouSection
  onSection(s: YouSection): void
  places: PlaceWithStats[]
  lists: List[]
  visits: Visit[]
  from: LatLng | null
  period: Period
  onPeriod(p: Period): void
  onPick(place: PlaceWithStats): void
  onVisit(visitId: string): void
  onSettings(): void
  onClose(): void
  /** Everything "Your map" needs (map views, recaps, bigger adventures). */
  map: Omit<ComponentProps<typeof YourMap>, 'visits' | 'places'>
}

const TITLES: Record<YouSection, string> = { places: 'Your places', journal: 'Journal', map: 'Your map' }

/**
 * Everything that's yours, in one tab: the places you've saved, the journal of
 * where you've been, and your progress. Settings live here too.
 */
export default function YouSheet({ section, onSection, places, lists, visits, from, period, onPeriod, onPick, onVisit, onSettings, onClose, map }: Props) {
  const favourites = places.filter((p) => p.visitCount >= 2).length
  const eyebrow =
    section === 'places'
      ? `${plural(places.length, 'place')} · ${plural(favourites, 'favourite')}`
      : section === 'journal'
        ? 'Where you’ve been'
        : 'How you’re exploring'

  return (
    <Sheet
      onClose={onClose}
      eyebrow={eyebrow}
      title={TITLES[section]}
      actions={
        <motion.button className="icon-btn" onClick={onSettings} whileTap={{ scale: 0.88 }} aria-label="Settings">
          <Settings size={18} strokeWidth={2.3} />
        </motion.button>
      }
    >
      <Segmented<YouSection>
        id="you-section"
        value={section}
        onChange={onSection}
        options={[
          ['places', 'Places'],
          ['journal', 'Journal'],
          ['map', 'Your map'],
        ]}
      />
      {section === 'places' ? (
        <PlacesBody places={places} lists={lists} from={from} onPick={onPick} />
      ) : section === 'journal' ? (
        <JournalBody visits={visits} places={places} period={period} onPeriod={onPeriod} onVisit={onVisit} />
      ) : (
        <YourMap visits={visits} places={places} {...map} />
      )}
    </Sheet>
  )
}
