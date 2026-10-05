import { ArrowRight, Check, Lock, LockKeyhole } from 'lucide-react'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useMemo, useState, type FormEvent } from 'react'
import { finishRecovery, updatePassword, useAuth } from '../lib/auth'
import { strength as rate } from '../lib/password'
import './auth.css'
import { AppIcon } from '../ui/Logo'
import { Field, Spinner, StrengthMeter, useBreachCheck } from './fields'

const ease = [0.16, 1, 0.3, 1] as const

/** Where the password-reset email lands: choose a new password, then carry on. */
export default function ResetPassword() {
  const { session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const shake = useAnimationControls()
  const email = session?.user.email ?? ''
  const pw = useMemo(() => rate(password, email), [password, email])
  const breaches = useBreachCheck(password, true)

  const fail = (msg: string) => {
    setError(msg)
    void shake.start({ x: [0, -9, 8, -6, 4, 0], transition: { duration: 0.42 } })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!session) return fail('This reset link has expired. Request a new one from the sign-in screen.')
    if (!pw.ok) return fail('Your password needs to meet every requirement.')
    if (typeof breaches === 'number' && breaches > 0) return fail('That password has appeared in a data breach. Please choose another.')
    if (confirm !== password) return fail('The two passwords don’t match.')
    setBusy(true)
    setError('')
    try {
      await updatePassword(password)
      setDone(true)
    } catch (err) {
      fail((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page single">
      <div className="auth-page-glow" aria-hidden />
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease }}
      >
        <motion.div className="auth" animate={shake}>
          <div className="auth-brand">
            <span className="auth-logo">
              <AppIcon size={56} />
            </span>
          </div>
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" className="auth-sent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <header className="auth-head">
                  <h2 className="display">Password updated</h2>
                  <p>You’re signed in. Use the new password on your other devices.</p>
                </header>
                <motion.span
                  className="auth-sent-icon ok"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                >
                  <Check size={30} strokeWidth={2.4} />
                </motion.span>
                <button className="auth-submit" onClick={finishRecovery}>
                  Open Wander <ArrowRight size={17} strokeWidth={2.4} />
                </button>
              </motion.div>
            ) : (
              <motion.div key="form" exit={{ opacity: 0, y: -8 }}>
                <header className="auth-head">
                  <h2 className="display">Choose a new password</h2>
                  <p>{email ? `For ${email}.` : 'Checking your reset link…'}</p>
                </header>
                <form className="auth-form" onSubmit={submit} noValidate>
                  {/* Lets password managers save the new password against the right account. */}
                  <input type="email" autoComplete="username" value={email} readOnly hidden />
                  <Field label="New password" icon={Lock} type="password" autoComplete="new-password" value={password} onChange={setPassword} autoFocus />
                  <AnimatePresence initial={false}>
                    {password && <StrengthMeter key="m" password={password} strength={pw} breaches={breaches} />}
                  </AnimatePresence>
                  <Field
                    label="Confirm new password"
                    icon={LockKeyhole}
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={setConfirm}
                    invalid={confirm.length > 0 && !password.startsWith(confirm)}
                  />
                  <AnimatePresence initial={false}>
                    {error && (
                      <motion.p
                        className="auth-error"
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <span>{error}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <motion.button className="auth-submit" whileTap={{ scale: 0.98 }} disabled={busy}>
                    {busy ? <Spinner /> : 'Update password'}
                  </motion.button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}
