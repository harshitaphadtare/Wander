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

// A typo in .env shouldn't take the whole app down; fall back to on-device mode.
const configured = !!url && !!key && validUrl(url)
if (url && !configured) {
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
