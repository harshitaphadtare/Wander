import { ArrowUpDown, ChevronRight, Compass } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import { plural, relativeTime } from '../lib/format'
import { distanceM, formatDistance, type LatLng } from '../lib/geo'
import { LEVELS } from '../lib/levels'
import { EmptyState, IconTile, Segmented, Stagger } from '../ui/bits'
import { categoryIcon, LEVEL_ICONS } from '../ui/icons'
import Sheet from '../ui/Sheet'

type Filter = 'all' | 'favourites' | 'unvisited'
type Sort = 'visits' | 'recent' | 'nearest' | 'name'

const SORT_LABEL: Record<Sort, string> = { visits: 'Most visited', recent: 'Recent', nearest: 'Nearest', name: 'A–Z' }

interface Props {
  places: PlaceWithStats[]
  from: LatLng | null
  onPick(place: PlaceWithStats): void
  onClose(): void
}

export default function PlacesPanel({ places, from, onPick, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('visits')

  const list = useMemo(() => {
    const filtered = places.filter((p) =>
      filter === 'favourites' ? p.visitCount >= 2 : filter === 'unvisited' ? p.visitCount === 0 : true,
    )
    const by: Record<Sort, (a: PlaceWithStats, b: PlaceWithStats) => number> = {
      visits: (a, b) => b.visitCount - a.visitCount || (b.lastVisitAt ?? 0) - (a.lastVisitAt ?? 0),
      recent: (a, b) => (b.lastVisitAt ?? b.createdAt) - (a.lastVisitAt ?? a.createdAt),
      nearest: (a, b) => (from ? distanceM(from, a) - distanceM(from, b) : 0),
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return filtered.sort(by[sort])
  }, [places, filter, sort, from])

  const favCount = places.filter((p) => p.visitCount >= 2).length
  const sorts: Sort[] = from ? ['visits', 'recent', 'nearest', 'name'] : ['visits', 'recent', 'name']
  const cycleSort = () => setSort(sorts[(sorts.indexOf(sort) + 1) % sorts.length])

  return (
    <Sheet
      onClose={onClose}
      eyebrow={`${plural(places.length, 'place')} · ${plural(favCount, 'favourite')}`}
      title="Your places"
    >
      {places.length > 0 && (
      <div className="toolbar">
        <Segmented<Filter>
          id="places-filter"
          value={filter}
          onChange={setFilter}
          options={[
            ['all', 'All'],
            ['favourites', 'Favourites'],
            ['unvisited', 'Want to go'],
          ]}
        />
        <button className="sort-btn" onClick={cycleSort} aria-label={`Sort: ${SORT_LABEL[sort]}`}>
          <ArrowUpDown size={14} strokeWidth={2.4} />
          {SORT_LABEL[sort]}
        </button>
      </div>
      )}

      {list.length === 0 ? (
        places.length === 0 ? (
          <EmptyState icon={Compass} title="Your map is waiting">
            Tap <strong>Check in</strong> wherever you are, search for a spot, or long-press the map to drop a pin.
          </EmptyState>
        ) : (
          <EmptyState icon={Compass} title="Nothing here yet">
            {filter === 'favourites' ? 'Visit a place twice and it becomes a favourite.' : 'Save places you want to try. They show up here.'}
          </EmptyState>
        )
      ) : (
        <ul className="rows" key={`${filter}-${sort}`}>
          {list.map((p, i) => (
            <Stagger key={p.id} index={i}>
              <button className="row" onClick={() => onPick(p)}>
                <IconTile icon={categoryIcon(p.category)} color={p.level.color} />
                <span className="row-text">
                  <strong>{p.name}</strong>
                  <small>
                    {p.level.label} · {plural(p.visitCount, 'visit')}
                    {p.lastVisitAt ? ` · ${relativeTime(p.lastVisitAt)}` : ''}
                  </small>
                </span>
                {from && <span className="row-meta">{formatDistance(distanceM(from, p))}</span>}
                <ChevronRight size={16} className="row-chev" />
              </button>
            </Stagger>
          ))}
        </ul>
      )}

      <section className="levels-card">
        <div className="list-label">How levels work</div>
        <div className="levels-track">
          {LEVELS.slice(1).map((l) => {
            const Icon = LEVEL_ICONS[l.key]
            return (
              <div key={l.key} className="levels-step">
                <IconTile icon={Icon} color={l.color} size={34} />
                <strong>{l.label}</strong>
                <small>{plural(l.min, 'visit')}</small>
              </div>
            )
          })}
        </div>
      </section>
    </Sheet>
  )
}
