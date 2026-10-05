import { ArrowLeft, MailCheck, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { authEnabled, resendConfirmation, sendPasswordReset, signIn, signInWithGoogle, signUp } from '../lib/auth'
import { strength as rate } from '../lib/password'
import { navigate } from '../lib/router'
import { Field, GoogleIcon, Spinner, StrengthMeter, useBreachCheck } from './fields'

export type AuthView = 'signin' | 'signup' | 'forgot' | 'reset-sent' | 'confirm-sent'

const ease = [0.16, 1, 0.3, 1] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RESEND_SECONDS = 60

const TITLES: Record<AuthView, [string, string]> = {
  signin: ['Welcome back', 'Sign in to your map.'],
  signup: ['Create your account', 'Free, and it keeps your phone and laptop in sync.'],
  forgot: ['Reset your password', 'We’ll email you a link to choose a new one.'],
  'reset-sent': ['Check your inbox', ''],
  'confirm-sent': ['Confirm your email', ''],
}

/** Remember how you signed in last time and point at it (a small kindness for return visits). */
const LAST_KEY = 'wander:last-auth'
type Method = 'google' | 'email'
function readLast(): Method | null {
  try {
    const v = localStorage.getItem(LAST_KEY)
    return v === 'google' || v === 'email' ? v : null
  } catch {
    return null
  }
}
function rememberLast(m: Method) {
  try {
    localStorage.setItem(LAST_KEY, m)
  } catch {
    /* private mode */
  }
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
  const [last] = useState(readLast)

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
      return void run('form', async () => {
        await signIn(addr, password)
        rememberLast('email')
      })
    }
    // sign up
    if (!pw.ok) return fail('Your password needs to meet every requirement below.')
    if (typeof breaches === 'number' && breaches > 0) return fail('That password has appeared in a data breach. Please choose another.')
    if (!matches) return fail('The two passwords don’t match.')
    void run('form', async () => {
      rememberLast('email')
      if ((await signUp(addr, password)) === 'confirm') {
        cooldown.start()
        setView('confirm-sent')
      }
    })
  }

  const [title, subtitle] = TITLES[view]
  const sent = view === 'reset-sent' || view === 'confirm-sent'

  const lastBadge = (m: Method) => (last === m && view === 'signin' ? <span className="auth-last">Last used</span> : null)

  return (
    <motion.div className="auth" animate={shake}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.24, ease }}
        >
          <header className="auth-head">
            <h1>{title}</h1>
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
                  <button
                    type="button"
                    className="auth-google"
                    disabled={!!busy}
                    onClick={() =>
                      run('google', async () => {
                        rememberLast('google')
                        await signInWithGoogle()
                      })
                    }
                  >
                    {busy === 'google' ? <Spinner /> : <GoogleIcon />}
                    Continue with Google
                    {lastBadge('google')}
                  </button>
                  <div className="auth-or">
                    <span>or</span>
                  </div>
                </>
              )}

              <form className="auth-form" onSubmit={submit} noValidate>
                <Field
                  label="Email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={setEmail}
                  invalid={touched && !emailOk}
                  autoFocus={view === 'forgot'}
                  aside={lastBadge('email')}
                />

                {view !== 'forgot' && (
                  <Field
                    label="Password"
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

                <button className="auth-submit" disabled={!!busy}>
                  {busy === 'form' ? <Spinner /> : view === 'signin' ? 'Sign in' : view === 'signup' ? 'Create account' : 'Send reset link'}
                </button>
              </form>

              <p className="auth-switch">
                {view === 'signin' ? (
                  <>
                    New to Wander?{' '}
                    <button type="button" onClick={() => go('signup')}>
                      Create an account
                    </button>
                  </>
                ) : view === 'signup' ? (
                  <>
                    Already have an account?{' '}
                    <button type="button" onClick={() => go('signin')}>
                      Sign in
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => go('signin')}>
                    <ArrowLeft size={14} /> Back to sign in
                  </button>
                )}
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <p className="auth-secure">
        <ShieldCheck size={14} />
        Your synced data is encrypted on this device before it’s uploaded.
      </p>
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
