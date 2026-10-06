import { Check, ListPlus, Pencil, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { List } from '../lib/db'
import { createList, toggleList } from '../lib/places'

/**
 * Lists are your own groups of places ("Brunch spots", "Take visitors"). Folded
 * away until you ask for it: the place's lists show as chips, and "Add to a
 * list" opens the picker.
 */
export default function ListChips({ placeId, listIds, lists }: { placeId: string; listIds: string[]; lists: List[] }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const on = new Set(listIds)

  const create = async (value: string) => {
    const trimmed = value.trim()
    setAdding(false)
    setName('')
    if (!trimmed) return
    const existing = lists.find((l) => l.name.toLowerCase() === trimmed.toLowerCase())
    const list = existing ?? (await createList(trimmed))
    if (!on.has(list.id)) await toggleList(placeId, list.id)
  }

  const shown = open ? lists : lists.filter((l) => on.has(l.id))

  if (!open && shown.length === 0) {
    return (
      <motion.button layout className="chip ghost list-open" onClick={() => setOpen(true)} whileTap={{ scale: 0.94 }}>
        <ListPlus size={14} strokeWidth={2.4} /> Add to a list
      </motion.button>
    )
  }

  return (
    <section>
      <div className="list-label">Lists</div>
      {open && (
        <p className="lists-hint">
          {lists.length === 0
            ? 'Group places your own way, like “Brunch spots” or “Take visitors”. Name your first list below; you’ll find it in Places.'
            : 'Tap a list to add or remove this place. Browse your lists from Places.'}
        </p>
      )}
      <div className="chips wrap">
        {shown.map((l) => {
          const active = on.has(l.id)
          return (
            <motion.button
              key={l.id}
              layout
              className={`chip ${active ? 'is-on solid' : ''}`}
              onClick={() => toggleList(placeId, l.id)}
              whileTap={{ scale: 0.94 }}
              aria-pressed={active}
            >
              <AnimatePresence initial={false}>
                {active && (
                  <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="chip-check">
                    <Check size={13} strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
              {l.name}
            </motion.button>
          )
        })}
        {!open ? (
          <motion.button layout className="chip ghost" onClick={() => setOpen(true)} whileTap={{ scale: 0.94 }}>
            <Pencil size={12} strokeWidth={2.6} /> Edit
          </motion.button>
        ) : adding || lists.length === 0 ? (
          <motion.form
            layout
            className="chip-input"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onSubmit={(e) => {
              e.preventDefault()
              void create(name)
            }}
          >
            <input autoFocus={adding} value={name} maxLength={40} placeholder="New list name" onChange={(e) => setName(e.target.value)} onBlur={() => create(name)} />
          </motion.form>
        ) : (
          <motion.button layout className="chip ghost" onClick={() => setAdding(true)} whileTap={{ scale: 0.94 }}>
            <Plus size={13} strokeWidth={2.6} /> New list
          </motion.button>
        )}
      </div>
    </section>
  )
}
