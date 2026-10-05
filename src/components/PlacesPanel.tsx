import { ArrowUpDown, Check, ChevronRight, Compass, ListPlus, Pencil, Trash } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import type { PlaceWithStats } from '../hooks/useData'
import type { List } from '../lib/db'
import { plural, relativeTime } from '../lib/format'
import { distanceM, formatDistance, type LatLng } from '../lib/geo'
import { LEVELS } from '../lib/levels'
import { createList, deleteList, renameList } from '../lib/places'
import { useConfirm } from '../ui/Confirm'
import { EmptyState, IconTile, Segmented, Stagger } from '../ui/bits'
import { categoryIcon, LEVEL_ICONS } from '../ui/icons'
import Sheet from '../ui/Sheet'

type Filter = 'all' | 'favourites' | 'unvisited'
type Sort = 'visits' | 'recent' | 'nearest' | 'name'

const SORT_LABEL: Record<Sort, string> = { visits: 'Most visited', recent: 'Recent', nearest: 'Nearest', name: 'A–Z' }

interface Props {
  places: PlaceWithStats[]
  lists: List[]
  from: LatLng | null
  onPick(place: PlaceWithStats): void
  onClose(): void
}

export default function PlacesPanel({ places, lists, from, onPick, onClose }: Props) {
  const confirm = useConfirm()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('visits')
  const [listId, setListId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const activeList = lists.find((l) => l.id === listId) ?? null

  const list = useMemo(() => {
    const filtered = places.filter(
      (p) =>
        (filter === 'favourites' ? p.visitCount >= 2 : filter === 'unvisited' ? p.visitCount === 0 : true) &&
        (!activeList || !!p.listIds?.includes(activeList.id)),
    )
    const by: Record<Sort, (a: PlaceWithStats, b: PlaceWithStats) => number> = {
      visits: (a, b) => b.visitCount - a.visitCount || (b.lastVisitAt ?? 0) - (a.lastVisitAt ?? 0),
      recent: (a, b) => (b.lastVisitAt ?? b.createdAt) - (a.lastVisitAt ?? a.createdAt),
      nearest: (a, b) => (from ? distanceM(from, a) - distanceM(from, b) : 0),
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return filtered.sort(by[sort])
  }, [places, filter, sort, from, activeList])

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

      {places.length > 0 && (
        <div className="chips scroll list-filter">
          <button className={`chip ${!activeList ? 'is-on solid' : ''}`} onClick={() => setListId(null)}>
            All places
          </button>
          {lists.map((l) => (
            <button key={l.id} className={`chip ${l.id === listId ? 'is-on solid' : ''}`} onClick={() => setListId(l.id === listId ? null : l.id)}>
              {l.name}
              <em>{places.filter((p) => p.listIds?.includes(l.id)).length}</em>
            </button>
          ))}
          <button
            className="chip ghost"
            onClick={async () => {
              const list = await createList(`List ${lists.length + 1}`)
              setListId(list.id)
              setRenaming(list.name)
            }}
          >
            <ListPlus size={14} strokeWidth={2.4} /> New list
          </button>
        </div>
      )}

      {activeList && (
        <motion.div className="list-head" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} key={activeList.id}>
          {renaming !== null ? (
            <form
              className="list-rename"
              onSubmit={async (e) => {
                e.preventDefault()
                await renameList(activeList.id, renaming)
                setRenaming(null)
              }}
            >
              <input
                autoFocus
                value={renaming}
                maxLength={40}
                onChange={(e) => setRenaming(e.target.value)}
                onBlur={async () => {
                  await renameList(activeList.id, renaming)
                  setRenaming(null)
                }}
                aria-label="List name"
              />
              <button className="icon-btn accent" aria-label="Save list name">
                <Check size={15} strokeWidth={3} />
              </button>
            </form>
          ) : (
            <>
              <span className="list-head-hint">Add places to this list from their page.</span>
              <button className="icon-btn" onClick={() => setRenaming(activeList.name)} aria-label="Rename list">
                <Pencil size={14} />
              </button>
              <button
                className="icon-btn"
                aria-label="Delete list"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete “${activeList.name}”?`,
                    message: 'The places stay saved. They just leave this list.',
                    confirmLabel: 'Delete list',
                    destructive: true,
                  })
                  if (!ok) return
                  await deleteList(activeList.id)
                  setListId(null)
                }}
              >
                <Trash size={14} />
              </button>
            </>
          )}
        </motion.div>
      )}

      {list.length === 0 ? (
        places.length === 0 ? (
          <EmptyState icon={Compass} title="Your map is waiting">
            Tap <strong>Check in</strong> wherever you are, search for a spot, or long-press the map to drop a pin.
          </EmptyState>
        ) : (
          <EmptyState icon={Compass} title="Nothing here yet">
            {activeList
              ? 'Open a place and tap this list under “Lists” to add it.'
              : filter === 'favourites'
                ? 'Visit a place twice and it becomes a favourite.'
                : 'Save places you want to try. They show up here.'}
          </EmptyState>
        )
      ) : (
        <ul className="rows" key={`${filter}-${sort}-${listId}`}>
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
