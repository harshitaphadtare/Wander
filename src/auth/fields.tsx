import { Check, Eye, EyeOff, ShieldAlert, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { breachCount, RULES, type Strength } from '../lib/password'

const ease = [0.16, 1, 0.3, 1] as const

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label: string
  value: string
  onChange(v: string): void
  /** Right side of the label row, e.g. a "Forgot password?" link. */
  aside?: ReactNode
  invalid?: boolean
}

/** Label above, input below (the shadcn / Linear pattern): easy to scan, works with autofill. */
export function Field({ label, value, onChange, aside, invalid, type = 'text', ...rest }: FieldProps) {
  const id = useId()
  const [reveal, setReveal] = useState(false)
  const [caps, setCaps] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="af">
      <div className="af-label">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      <div className={`af-box ${invalid ? 'invalid' : ''}`}>
        <input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => isPassword && setCaps(e.getModifierState('CapsLock'))}
          onBlur={() => setCaps(false)}
          aria-invalid={invalid || undefined}
          spellCheck={false}
          autoCapitalize="off"
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className="af-reveal"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {caps && (
          <motion.p
            className="af-caps"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease }}
          >
            Caps Lock is on
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

const BAR_COLORS = ['#e5484d', '#e5484d', '#f29d0c', '#12a187', '#0e8a73']

/** Four-segment meter, rule checklist and a live breach check. */
export function StrengthMeter({ password, strength, breaches }: { password: string; strength: Strength; breaches: number | null | 'checking' }) {
  const color = BAR_COLORS[strength.score]
  return (
    <motion.div
      className="strength"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease }}
    >
      <div className="strength-head">
        <div className="strength-bars" role="meter" aria-valuemin={0} aria-valuemax={4} aria-valuenow={strength.score} aria-label="Password strength">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="strength-bar">
              <motion.span
                className="strength-fill"
                initial={false}
                animate={{ scaleX: password && i < Math.max(1, strength.score) ? 1 : 0, backgroundColor: color }}
                transition={{ duration: 0.35, ease, delay: i * 0.04 }}
              />
            </span>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={strength.label}
            className="strength-label"
            style={{ color }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {strength.label}
          </motion.span>
        </AnimatePresence>
      </div>
      <ul className="strength-rules">
        {RULES.map((rule) => {
          const ok = strength.passed.has(rule.id)
          return (
            <li key={rule.id} className={ok ? 'ok' : ''}>
              <span className="strength-check">
                <AnimatePresence initial={false}>
                  {ok && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                    >
                      <Check size={11} strokeWidth={3.4} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              {rule.label}
            </li>
          )
        })}
      </ul>
      <AnimatePresence mode="wait" initial={false}>
        {typeof breaches === 'number' && (
          <motion.p
            key={breaches > 0 ? 'bad' : 'good'}
            className={`strength-breach ${breaches > 0 ? 'bad' : 'good'}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {breaches > 0 ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
            {breaches > 0
              ? `Seen in ${breaches.toLocaleString()} data breaches. Choose another.`
              : 'Not found in any known data breach.'}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Debounced Have I Been Pwned lookup for the password being typed. */
export function useBreachCheck(password: string, enabled: boolean): number | null | 'checking' {
  const [result, setResult] = useState<{ pw: string; n: number | null } | null>(null)
  useEffect(() => {
    if (!enabled || password.length < 6) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      const n = await breachCount(password, ctrl.signal)
      if (!ctrl.signal.aborted) setResult({ pw: password, n })
    }, 450)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [password, enabled])
  if (!enabled || password.length < 6) return null
  return result?.pw === password ? result.n : 'checking'
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export function Spinner() {
  return <span className="auth-spinner" aria-hidden />
}
