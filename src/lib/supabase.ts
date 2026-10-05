import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim()

function validUrl(value: string) {
  try {
    return /^https?:$/.test(new URL(value).protocol)
  } catch {
    return false
  }
}

/**
 * A secret / service_role key bypasses row-level security, and anything in a
 * VITE_ variable ships to every visitor. Refuse it loudly rather than use it.
 */
function isSecretKey(value: string) {
  if (value.startsWith('sb_secret_')) return true
  try {
    // Legacy JWT keys: the payload says which role it grants.
    return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'
  } catch {
    return false
  }
}
const secret = !!key && isSecretKey(key)
if (secret) {
  console.error(
    '[wander] VITE_SUPABASE_KEY is a SECRET key. It must be the publishable key (sb_publishable_…). ' +
      'Replace it, redeploy, and rotate the secret key in Supabase: it has been exposed.',
  )
}

// A typo in .env shouldn't take the whole app down; fall back to on-device mode.
const configured = !!url && !!key && !secret && validUrl(url)
if (url && !configured && !secret) {
  console.warn(
    `[wander] VITE_SUPABASE_URL isn't a URL (expected https://<project>.supabase.co${url.startsWith('sb_') ? '; it looks like the key was pasted there' : ''}). Accounts and sync are off.`,
  )
}

/**
 * Cloud sync is optional: without these env vars the app runs fully on-device.
 * The publishable/anon key is safe to ship in the front end; row-level security
 * in supabase/schema.sql makes sure each user only sees their own rows.
 */
export const supabase: SupabaseClient | null = configured ? createClient(url, key) : null
