import type { LucideIcon } from 'lucide-react'
import { animate, motion } from 'motion/react'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

/** Rounded-square icon on a soft tint of `color`. */
export function IconTile({ icon: Icon, color, size = 40 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <span className="tile" style={{ '--c': color, width: size, height: size } as CSSProperties} aria-hidden>
      <Icon size={Math.round(size * 0.48)} strokeWidth={2.2} />
    </span>
  )
}

/** Pill tabs with a thumb that glides between options. */
export function Segmented<T extends string>({
  id,
  options,
  value,
  onChange,
}: {
  id: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange(v: T): void
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([key, label]) => (
        <button key={key} role="tab" aria-selected={value === key} onClick={() => onChange(key)}>
          {value === key && (
            <motion.span
              layoutId={`seg-${id}`}
              className="segmented-thumb"
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
            />
          )}
          <span className="segmented-label">{label}</span>
        </button>
      ))}
    </div>
  )
}

/** Number that counts up/down to its new value. */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  useEffect(() => {
    const show = (v: number) => {
      if (ref.current) ref.current.textContent = String(Math.round(v))
    }
    const controls = animate(from.current, value, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: show,
      // Skipped/reduced-motion animations may never call onUpdate; always land on the real number.
      onComplete: () => show(value),
    })
    from.current = value
    return () => {
      controls.stop()
      show(value)
    }
  }, [value])
  return <span ref={ref}>0</span>
}

/** Circular progress ring that draws itself in. */
export function ProgressRing({ value, color, size = 56, children }: { value: number; color: string; size?: number; children?: ReactNode }) {
  const stroke = 5
  const r = (size - stroke) / 2
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.02, Math.min(1, value)) }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
      </svg>
      <span className="ring-center">{children}</span>
    </span>
  )
}

/** Fades + lifts children in one after another. Wrap list items. */
export function Stagger({ children, index, className }: { children: ReactNode; index: number; className?: string }) {
  return (
    <motion.li
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 12) * 0.035 }}
    >
      {children}
    </motion.li>
  )
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <motion.div className="empty" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <span className="empty-icon">
        <Icon size={26} strokeWidth={1.8} />
      </span>
      <h3 className="display">{title}</h3>
      {children && <p>{children}</p>}
    </motion.div>
  )
}
