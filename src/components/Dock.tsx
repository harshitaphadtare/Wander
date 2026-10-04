import { BookOpen, Bookmark, MapPinPlus, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

export type Tab = 'places' | 'journal'

interface Props {
  tab: Tab | null
  busy: boolean
  onTab(tab: Tab): void
  onCheckIn(): void
}

function DockTab({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick(): void }) {
  return (
    <motion.button className={`dock-tab ${active ? 'is-active' : ''}`} onClick={onClick} whileTap={{ scale: 0.92 }} aria-pressed={active}>
      {active && (
        <motion.span layoutId="dock-active" className="dock-active" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
      )}
      <Icon size={21} strokeWidth={active ? 2.4 : 2} />
      <span>{label}</span>
    </motion.button>
  )
}

/** Floating glass dock: Places · Check in · Journal. */
export default function Dock({ tab, busy, onTab, onCheckIn }: Props) {
  return (
    <motion.nav
      className="dock glass"
      aria-label="Main"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.1 }}
    >
      <DockTab icon={Bookmark} label="Places" active={tab === 'places'} onClick={() => onTab('places')} />
      <motion.button
        className="dock-primary"
        onClick={onCheckIn}
        disabled={busy}
        whileTap={{ scale: 0.94 }}
        aria-label="Check in where you are"
      >
        <MapPinPlus size={20} strokeWidth={2.4} />
        <span>Check in</span>
      </motion.button>
      <DockTab icon={BookOpen} label="Journal" active={tab === 'journal'} onClick={() => onTab('journal')} />
    </motion.nav>
  )
}
