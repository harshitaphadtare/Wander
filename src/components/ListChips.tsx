import { Check, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { List } from '../lib/db'
import { createList, toggleList } from '../lib/places'

const SUGGESTED = ['Rainy day', 'Date spots', 'Work cafés', 'Take visitors']

/** Which of your lists this place is on; tap to add or remove, or start a new list inline. */
export default function ListChips({ placeId, listIds, lists }: { placeId: string; listIds: string[]; lists: List[] }) {
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

  // First time: offer a few starter lists so the feature explains itself.
  const suggestions = lists.length === 0 ? SUGGESTED : []

  return (
    <section>
      <div className="list-label">Lists</div>
      {on.size === 0 && (
        <p className="lists-hint">Your own collections, like “Rainy day” or “Date spots”. Tap one to add this place; open them from Places.</p>
      )}
      <div className="chips wrap">
        {lists.map((l) => {
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
        {suggestions.map((s) => (
          <motion.button key={s} layout className="chip ghost" onClick={() => create(s)} whileTap={{ scale: 0.94 }}>
            <Plus size={13} strokeWidth={2.6} /> {s}
          </motion.button>
        ))}
        {adding ? (
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
            <input autoFocus value={name} maxLength={40} placeholder="List name" onChange={(e) => setName(e.target.value)} onBlur={() => create(name)} />
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
