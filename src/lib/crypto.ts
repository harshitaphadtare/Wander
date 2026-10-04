import { supabase } from './supabase'

/**
 * Client-side encryption for everything that leaves the device.
 *
 * Each row's JSON is sealed with AES-256-GCM before it's uploaded, so the
 * `records` table only ever holds ciphertext. The per-user key comes from the
 * `data_key()` database function: an HMAC of the user's id under a root secret
 * kept in Supabase Vault. A leaked table, backup or log therefore shows nothing
 * readable, and the key doesn't change when a password is reset or when the
 * account signs in with Google instead.
 *
 * The row id and table name are bound in as additional authenticated data, so a
 * ciphertext copied onto another row fails to decrypt instead of loading.
 */

export interface Sealed {
  v: 1
  iv: string
  ct: string
}

let cached: { userId: string; key: Promise<CryptoKey> } | null = null

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function fetchKey(): Promise<CryptoKey> {
  const { data, error } = await supabase!.rpc('data_key')
  if (error) {
    // PGRST202 = function not found: the project predates encryption.
    if (error.code === 'PGRST202') throw new Error('Encryption isn’t set up on the server. Re-run supabase/schema.sql.')
    throw error
  }
  const raw = fromB64(data as string)
  if (raw.length !== 32) throw new Error('Server returned an invalid encryption key.')
  // Non-extractable: page scripts can use the key but never read its bytes back out.
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export function keyFor(userId: string): Promise<CryptoKey> {
  if (cached?.userId !== userId) {
    const key = fetchKey()
    cached = { userId, key }
    key.catch(() => {
      if (cached?.key === key) cached = null
    })
  }
  return cached.key
}

export function forgetKey() {
  cached = null
}

const aad = (table: string, id: string) => new TextEncoder().encode(`wander:${table}:${id}`)

export async function seal(key: CryptoKey, table: string, id: string, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(value))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(table, id) }, key, plain)
  return { v: 1, iv: toB64(iv), ct: toB64(ct) }
}

export function isSealed(value: unknown): value is Sealed {
  const v = value as Partial<Sealed> | null
  return !!v && v.v === 1 && typeof v.iv === 'string' && typeof v.ct === 'string'
}

export async function open<T>(key: CryptoKey, table: string, id: string, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: aad(table, id) },
    key,
    fromB64(sealed.ct),
  )
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
