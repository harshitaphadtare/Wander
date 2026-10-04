import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/**
 * Cloud sync is optional: without these env vars the app runs fully on-device.
 * The publishable/anon key is safe to ship in the front end; row-level security
 * in supabase/schema.sql makes sure each user only sees their own rows.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
