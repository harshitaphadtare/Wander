import { ArrowLeft, ArrowRight, Lock, LockKeyhole, Mail, MailCheck, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { authEnabled, resendConfirmation, sendPasswordReset, signIn, signInWithGoogle, signUp } from '../lib/auth'
import { strength as rate } from '../lib/password'
import { Segmented } from '../ui/bits'
import { navigate } from '../lib/router'
import { AppIcon } from '../ui/Logo'
import { Field, GoogleIcon, Spinner, StrengthMeter, useBreachCheck } from './fields'

export type AuthView = 'signin' | 'signup' | 'forgot' | 'reset-sent' | 'confirm-sent'

const ease = [0.16, 1, 0.3, 1] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RESEND_SECONDS = 60

const TITLES: Record<AuthView, [string, string]> = {
  signin: ['Welcome back', 'Sign in to pick up where you left off.'],
  signup: ['Start wandering', 'One account keeps your phone and laptop in sync.'],
  forgot: ['Reset your password', 'We’ll email you a link to choose a new one.'],
  'reset-sent': ['Check your inbox', ''],
  'confirm-sent': ['Confirm your email', ''],
}

function useCooldown() {
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= now) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until, now])
  return {
    left: Math.max(0, Math.ceil((until - now) / 1000)),
    start: () => {
      setNow(Date.now())
      setUntil(Date.now() + RESEND_SECONDS * 1000)
    },
  }
}

export default function AuthPanel({ initial = 'signin' }: { initial?: AuthView }) {
  const [view, setView] = useState<AuthView>(initial)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<null | 'form' | 'google'>(null)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  const shake = useAnimationControls()
  const cooldown = useCooldown()

  const creating = view === 'signup'
  const pw = useMemo(() => rate(password, email), [password, email])
  const breaches = useBreachCheck(password, creating)
  const emailOk = EMAIL_RE.test(email.trim())
  const matches = confirm.length > 0 && confirm === password

  const go = (next: AuthView) => {
    setError('')
    setTouched(false)
    if (next === 'signin' || next === 'signup') {
      setConfirm('')
      // Keep the address bar in step: /login ↔ /signup.
      navigate(next === 'signup' ? '/signup' : '/login', { replace: true })
    }
    setView(next)
  }

  const fail = (msg: string) => {
    setError(msg)
    void shake.start({ x: [0, -9, 8, -6, 4, 0], transition: { duration: 0.42 } })
  }

  const run = async (kind: 'form' | 'google', fn: () => Promise<void>) => {
    setBusy(kind)
    setError('')
    try {
      await fn()
    } catch (err) {
      fail((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const addr = email.trim()
    if (!emailOk) return fail('Enter a valid email address.')

    if (view === 'forgot') {
      return void run('form', async () => {
        await sendPasswordReset(addr)
        cooldown.start()
        setView('reset-sent')
      })
    }
    if (view === 'signin') {
      if (!password) return fail('Enter your password.')
      return void run('form', () => signIn(addr, password))
    }
    // sign up
    if (!pw.ok) return fail('Your password needs to meet every requirement below.')
    if (typeof breaches === 'number' && breaches > 0) return fail('That password has appeared in a data breach. Please choose another.')
    if (!matches) return fail('The two passwords don’t match.')
    void run('form', async () => {
      if ((await signUp(addr, password)) === 'confirm') {
        cooldown.start()
        setView('confirm-sent')
      }
    })
  }

  const [title, subtitle] = TITLES[view]
  const sent = view === 'reset-sent' || view === 'confirm-sent'

  return (
    <motion.div className="auth" animate={shake}>
      <div className="auth-brand">
        <span className="auth-logo" aria-hidden>
          <AppIcon size={56} />
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.28, ease }}
        >
          <header className="auth-head">
            <h2 className="display">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </header>

          {!authEnabled ? (
            <NotConfigured />
          ) : sent ? (
            <SentState
              email={email.trim()}
              kind={view}
              cooldown={cooldown.left}
              onResend={() =>
                run('form', async () => {
                  if (view === 'reset-sent') await sendPasswordReset(email.trim())
                  else await resendConfirmation(email.trim())
                  cooldown.start()
                })
              }
              busy={busy === 'form'}
              onBack={() => go('signin')}
            />
          ) : (
            <>
              {view !== 'forgot' && (
                <>
                  <div className="auth-tabs">
                    <Segmented
                      id="auth"
                      options={[
                        ['signin', 'Sign in'],
                        ['signup', 'Create account'],
                      ]}
                      value={view as 'signin' | 'signup'}
                      onChange={go}
                    />
                  </div>
                  <motion.button
                    type="button"
                    className="auth-google"
                    whileTap={{ scale: 0.98 }}
                    disabled={!!busy}
                    onClick={() => run('google', signInWithGoogle)}
                  >
                    {busy === 'google' ? <Spinner /> : <GoogleIcon />}
                    Continue with Google
                  </motion.button>
                  <div className="auth-or">
                    <span>or with email</span>
                  </div>
                </>
              )}

              <form className="auth-form" onSubmit={submit} noValidate>
                <Field
                  label="Email"
                  icon={Mail}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={setEmail}
                  invalid={touched && !emailOk}
                  autoFocus={view === 'forgot'}
                />

                {view !== 'forgot' && (
                  <Field
                    label="Password"
                    icon={Lock}
                    type="password"
                    autoComplete={creating ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={setPassword}
                    invalid={touched && !password}
                    aside={
                      view === 'signin' ? (
                        <button type="button" className="auth-link" onClick={() => go('forgot')}>
                          Forgot password?
                        </button>
                      ) : undefined
                    }
                  />
                )}

                <AnimatePresence initial={false}>
                  {creating && password && <StrengthMeter key="meter" password={password} strength={pw} breaches={breaches} />}
                </AnimatePresence>

                {creating && (
                  <Field
                    label="Confirm password"
                    icon={LockKeyhole}
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={setConfirm}
                    invalid={confirm.length > 0 && !password.startsWith(confirm)}
                  />
                )}

                <AnimatePresence initial={false}>
                  {error && (
                    <motion.p
                      key="err"
                      className="auth-error"
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease }}
                    >
                      <span>{error}</span>
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button className="auth-submit" whileTap={{ scale: 0.98 }} disabled={!!busy}>
                  {busy === 'form' ? (
                    <Spinner />
                  ) : (
                    <>
                      {view === 'signin' ? 'Sign in' : view === 'signup' ? 'Create account' : 'Send reset link'}
                      <ArrowRight size={17} strokeWidth={2.4} className="auth-submit-arrow" />
                    </>
                  )}
                </motion.button>
              </form>

              {view === 'forgot' && (
                <button type="button" className="auth-back" onClick={() => go('signin')}>
                  <ArrowLeft size={15} /> Back to sign in
                </button>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <footer className="auth-foot">
        <p className="auth-secure">
          <ShieldCheck size={14} />
          Synced data is encrypted on your device with AES-256 before it’s uploaded.
        </p>
      </footer>
    </motion.div>
  )
}

function SentState({
  email,
  kind,
  cooldown,
  busy,
  onResend,
  onBack,
}: {
  email: string
  kind: 'reset-sent' | 'confirm-sent'
  cooldown: number
  busy: boolean
  onResend(): void
  onBack(): void
}) {
  return (
    <div className="auth-sent">
      <motion.span
        className="auth-sent-icon"
        initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
      >
        <MailCheck size={30} strokeWidth={1.8} />
      </motion.span>
      <p>
        We sent a link to <strong>{email}</strong>.{' '}
        {kind === 'reset-sent'
          ? 'Open it to choose a new password. It expires in an hour.'
          : 'Open it to activate your account, then come back and sign in.'}
      </p>
      <p className="auth-hint">On iPhone the link opens in Safari. That’s fine: finish there, then sign in here.</p>
      <button type="button" className="auth-submit secondary" disabled={busy || cooldown > 0} onClick={onResend}>
        {busy ? <Spinner /> : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
      </button>
      <button type="button" className="auth-back" onClick={onBack}>
        <ArrowLeft size={15} /> Back to sign in
      </button>
    </div>
  )
}

function NotConfigured(): ReactNode {
  return (
    <div className="auth-sent">
      <p>
        Sign-in isn’t set up for this copy of Wander yet. Add your Supabase project’s URL and key (see <code>docs/SETUP.md</code>), then
        reload.
      </p>
    </div>
  )
}
