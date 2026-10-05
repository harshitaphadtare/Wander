import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import type { ReactNode } from 'react'
import { useIsDesktop } from '../hooks/useMedia'

interface Props {
  /** Small line above the title (category, context). */
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Leading visual next to the title, e.g. an IconTile. */
  leading?: ReactNode
  onClose(): void
  children: ReactNode
  /** Sticks to the bottom of the sheet (primary actions). */
  footer?: ReactNode
  /** Minimisable sheets shrink to just their header so the map shows through. */
  collapsed?: boolean
  onToggleCollapse?(): void
}

const spring = { type: 'spring', damping: 34, stiffness: 380, mass: 0.9 } as const
const exitEase = { duration: 0.2, ease: [0.4, 0, 1, 1] } as const

/**
 * Floating card sheet. Phones: rises from the bottom and can be flicked down
 * to dismiss. Wide screens: a side panel that slides in from the left.
 */
export default function Sheet({ eyebrow, title, subtitle, leading, onClose, children, footer, collapsed = false, onToggleCollapse }: Props) {
  const desktop = useIsDesktop()
  const drag = useDragControls()

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const down = info.offset.y > 110 || info.velocity.y > 650
    const up = info.offset.y < -40 || info.velocity.y < -500
    if (onToggleCollapse) {
      // Minimisable: a flick down minimises first, a second one closes; a flick up restores.
      if (down) {
        if (collapsed) onClose()
        else onToggleCollapse()
      } else if (up && collapsed) onToggleCollapse()
      return
    }
    if (down) onClose()
  }
  const startDrag = (e: React.PointerEvent) => {
    if (!desktop) drag.start(e)
  }

  return (
    <motion.section
      layout={onToggleCollapse ? 'size' : false}
      className={`sheet ${collapsed ? 'is-collapsed' : ''}`}
      role="dialog"
      aria-modal="false"
      initial={desktop ? { x: -28, opacity: 0 } : { y: '105%' }}
      animate={desktop ? { x: 0, opacity: 1 } : { y: 0 }}
      exit={desktop ? { x: -28, opacity: 0, transition: exitEase } : { y: '110%', transition: exitEase }}
      transition={spring}
      drag={desktop ? false : 'y'}
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: onToggleCollapse ? 0.2 : 0.04, bottom: 0.75 }}
      onDragEnd={onDragEnd}
    >
      <div className="sheet-grab" onPointerDown={startDrag}>
        <span className="sheet-handle" />
      </div>
      <header
        className="sheet-header"
        onPointerDown={startDrag}
        onClick={collapsed && onToggleCollapse ? onToggleCollapse : undefined}
      >
        {leading}
        <div className="sheet-titles">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2 className="display">{title}</h2>
          {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
        </div>
        {onToggleCollapse && (
          <motion.button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={collapsed ? 'Expand' : 'Minimise to see the map'}
            aria-expanded={!collapsed}
            whileTap={{ scale: 0.88 }}
          >
            {collapsed ? <ChevronUp size={18} strokeWidth={2.4} /> : <ChevronDown size={18} strokeWidth={2.4} />}
          </motion.button>
        )}
        <motion.button
          className="icon-btn"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close"
          whileTap={{ scale: 0.88 }}
        >
          <X size={18} strokeWidth={2.4} />
        </motion.button>
      </header>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            className="sheet-collapsible"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="sheet-body">{children}</div>
            {footer && <footer className="sheet-footer">{footer}</footer>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
