import type { Session } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { navigate } from './router'
import { supabase } from './supabase'
import { syncBeforeSignOut } from './sync'

/**
 * Accounts (Supabase Auth). Passwords are never stored by Wander: Supabase
 * hashes them with bcrypt, and every request goes over TLS.
 *
 * Email links (confirm, reset) use Supabase's default implicit flow, which puts
 * the session in the URL fragment. That matters on iPhone: the link opens in
 * Safari rather than the home-screen app, and a PKCE link would fail there
 * because its verifier lives in the app's separate storage.
 */

export const authEnabled = !!supabase

export interface AuthState {
  ready: boolean
  session: Session | null
  /** Set while the user arrived from a password-reset email. */
  recovering: boolean
}

// Wander needs an account now; clear the old "use without an account" flag.
try {
  localStorage.removeItem('wander:guest')
} catch {
  /* private mode */
}

let state: AuthState = {
  ready: !supabase,
  session: null,
  recovering: /type=recovery/.test(location.hash) || location.pathname.startsWith('/reset-password'),
}
const listeners = new Set<() => void>()
function set(patch: Partial<AuthState>) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

supabase?.auth.onAuthStateChange((event, session) => {
  set({ ready: true, session, ...(event === 'PASSWORD_RECOVERY' ? { recovering: true } : {}) })
  // Drop tokens from the address bar once Supabase has read them.
  if (session && /access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search)
})

export const authStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  get: () => state,
}

export function useAuth() {
  return useSyncExternalStore(authStore.subscribe, authStore.get)
}

function client() {
  if (!supabase) throw new Error('Accounts aren’t set up for this copy of Wander.')
  return supabase
}

/** Where Google and the confirmation email send you back to. */
const appUrl = () => `${location.origin}/app`

/** Turn Supabase's error strings into something a person can act on. */
function friendly(err: { message: string; status?: number; code?: string }): Error {
  const m = err.message
  if (err.code === 'invalid_credentials' || m === 'Invalid login credentials') return new Error('That email and password don’t match.')
  if (err.code === 'email_not_confirmed') return new Error('Confirm your email first. We’ve sent you a link.')
  if (err.code === 'user_already_exists' || /already registered/i.test(m)) return new Error('There’s already an account with that email. Try signing in.')
  if (err.code === 'weak_password') return new Error('Pick a stronger password.')
  if (err.code === 'same_password') return new Error('Your new password must be different from the old one.')
  if (err.status === 429 || /rate limit/i.test(m)) return new Error('Too many attempts. Wait a minute and try again.')
  if (/fetch|network/i.test(m)) return new Error('Can’t reach the server. Check your connection.')
  return new Error(m)
}

export async function signIn(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email, password })
  if (error) throw friendly(error)
}

/** Resolves to 'confirm' when Supabase wants the email confirmed before the first sign-in. */
export async function signUp(email: string, password: string): Promise<'signed-in' | 'confirm'> {
  const { data, error } = await client().auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } })
  if (error) throw friendly(error)
  // With "Confirm email" on, Supabase hides whether the address already exists by
  // returning a user with no identities instead of an error.
  if (data.user && data.user.identities?.length === 0) throw friendly({ message: 'already registered' })
  return data.session ? 'signed-in' : 'confirm'
}

export async function resendConfirmation(email: string) {
  const { error } = await client().auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl() } })
  if (error) throw friendly(error)
}

export async function signInWithGoogle() {
  const { error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: appUrl(), queryParams: { prompt: 'select_account' } },
  })
  if (error) throw friendly(error)
}

export async function sendPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` })
  if (error) throw friendly(error)
}

export async function updatePassword(password: string) {
  const { error } = await client().auth.updateUser({ password })
  if (error) throw friendly(error)
  set({ recovering: false })
}

export function finishRecovery() {
  set({ recovering: false })
  navigate('/app', { replace: true })
}

export function openAuth(view: 'signin' | 'signup' = 'signin') {
  navigate(view === 'signup' ? '/signup' : '/login')
}

export async function signOut() {
  await syncBeforeSignOut() // don't leave unsynced changes stranded on this device
  await supabase?.auth.signOut()
  navigate('/login', { replace: true })
}
