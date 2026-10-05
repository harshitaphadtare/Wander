import type { Session } from '@supabase/supabase-js'
import { onLocalChange } from './changes'
import { forgetKey, isSealed, keyFor, open, seal, type Sealed } from './crypto'
import { db, getMeta, setMeta, SYNCED_TABLES, withoutDirty, type SyncedTable } from './db'
import { mergeRows } from './merge'
import { supabase } from './supabase'

/**
 * Local-first sync with Supabase.
 *
 * Each device keeps its full copy in IndexedDB. Rows edited locally are marked
 * dirty; a sync pushes dirty rows, then pulls anything the server received since
 * the last pull (cursor = server-set `server_updated_at`, immune to phone clock
 * drift). Conflicts resolve last-write-wins on the row's `updatedAt`.
 *
 * Server side it's one generic `records` table (see supabase/schema.sql) holding
 * each row as JSON, so new fields or tables need no migrations. The JSON is
 * encrypted on the device first (lib/crypto.ts); only ids, timestamps and the
 * deleted flag travel in the clear, because the sync cursor needs them.
 */

export type SyncStatus = 'disabled' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatus
  email?: string
  lastSyncedAt?: number
  error?: string
}

let state: SyncState = { status: supabase ? 'signed-out' : 'disabled' }
const listeners = new Set<() => void>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

export const syncStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  get: () => state,
}

let session: Session | null = null
let running: Promise<void> | null = null
let again = false
let debounce: ReturnType<typeof setTimeout> | undefined

interface RecordRow {
  id: string
  user_id: string
  table_name: SyncedTable
  data: unknown
  updated_at: number
  deleted: boolean
  server_updated_at: string
}

const PAGE = 500

type LocalRow = Record<string, unknown> & { id: string; updatedAt: number; deleted?: number }

async function push(userId: string, key: CryptoKey) {
  for (const table of SYNCED_TABLES) {
    const t = db.table(table)
    const dirty = (await t.where('dirty').equals(1).toArray()) as LocalRow[]
    for (let i = 0; i < dirty.length; i += PAGE) {
      const batch = dirty.slice(i, i + PAGE)
      const rows = await Promise.all(
        batch.map((row) => withoutDirty(row) as LocalRow).map(async (data) => ({
          id: data.id,
          user_id: userId,
          table_name: table,
          data: await seal(key, table, data.id, data),
          updated_at: data.updatedAt,
          deleted: !!data.deleted,
        })),
      )
      const { error } = await supabase!.from('records').upsert(rows)
      // 23514 = check violation: the server's schema predates this table.
      if (error?.code === '23514') throw new Error('The server needs an update. Re-run supabase/schema.sql in Supabase.')
      if (error) throw error
      // Clear the flag only if the row wasn't edited again while we were pushing.
      await db.transaction('rw', t, async () => {
        for (const row of batch) {
          await t
            .where('id')
            .equals(row.id)
            .and((r) => r.updatedAt === row.updatedAt)
            .modify({ dirty: 0 })
        }
      })
    }
  }
}

async function pull(key: CryptoKey) {
  // Small overlap so a row committed out of order isn't skipped; merging is idempotent.
  const cursor = await getMeta<string | null>('sync:pullCursor', null)
  let since = cursor ? new Date(new Date(cursor).getTime() - 5_000).toISOString() : '1970-01-01T00:00:00Z'
  let newest = cursor

  for (;;) {
    const { data, error } = await supabase!
      .from('records')
      .select('*')
      .gt('server_updated_at', since)
      .order('server_updated_at', { ascending: true })
      .limit(PAGE)
    if (error) throw error
    const rows = data as RecordRow[]
    if (rows.length === 0) break

    // Rows written before encryption existed are still plaintext on the server.
    // Merge those as dirty so the next push replaces them with ciphertext.
    const sealed = new Map<SyncedTable, LocalRow[]>()
    const legacy = new Map<SyncedTable, LocalRow[]>()
    for (const r of rows) {
      if (!SYNCED_TABLES.includes(r.table_name)) continue
      const isNew = isSealed(r.data)
      const data = isNew ? await open<LocalRow>(key, r.table_name, r.id, r.data as Sealed) : (r.data as LocalRow)
      const bucket = isNew ? sealed : legacy
      const list = bucket.get(r.table_name) ?? []
      list.push({ ...data, id: r.id, updatedAt: r.updated_at, deleted: r.deleted ? 1 : 0 })
      bucket.set(r.table_name, list)
    }
    for (const [table, list] of sealed) await mergeRows(table, list, false)
    for (const [table, list] of legacy) if ((await mergeRows(table, list, true)) > 0) again = true

    newest = rows[rows.length - 1].server_updated_at
    since = newest
    if (rows.length < PAGE) break
  }
  if (newest) await setMeta('sync:pullCursor', newest)
}

async function runSync() {
  if (!supabase || !session) return
  if (!navigator.onLine) {
    setState({ status: 'offline' })
    return
  }
  setState({ status: 'syncing', error: undefined })
  try {
    const key = await keyFor(session.user.id)
    await push(session.user.id, key)
    await pull(key)
    setState({ status: 'idle', lastSyncedAt: Date.now() })
  } catch (err) {
    setState({ status: 'error', error: err instanceof Error ? err.message : String((err as { message?: string }).message ?? err) })
  }
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = runSync().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

function scheduleSync(delay = 2_000) {
  clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), delay)
}

/**
 * If a different account signs in, re-upload everything and pull from scratch.
 * The same happens once for accounts that synced before encryption existed, so
 * their plaintext rows on the server get replaced with ciphertext.
 */
async function onSignedIn(s: Session) {
  const lastUser = await getMeta<string | null>('sync:userId', null)
  const encryptedFor = await getMeta<string | null>('sync:encryptedFor', null)
  if (lastUser !== s.user.id || encryptedFor !== s.user.id) {
    await db.transaction('rw', SYNCED_TABLES.map((t) => db.table(t)), async () => {
      for (const t of SYNCED_TABLES) await db.table(t).toCollection().modify({ dirty: 1 })
    })
    await setMeta('sync:pullCursor', null)
    await setMeta('sync:userId', s.user.id)
    await syncNow()
    if (syncStore.get().status === 'idle') await setMeta('sync:encryptedFor', s.user.id)
    return
  }
  void syncNow()
}

let started = false
export function startSync() {
  if (!supabase || started) return
  started = true

  supabase.auth.onAuthStateChange((event, s) => {
    session = s
    if (!s) {
      forgetKey()
      setState({ status: 'signed-out', email: undefined })
      return
    }
    setState({ email: s.user.email, status: state.status === 'signed-out' ? 'idle' : state.status })
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      // Defer: Supabase recommends not awaiting other calls inside this callback.
      setTimeout(() => void onSignedIn(s), 0)
    }
  })

  onLocalChange(() => scheduleSync())
  window.addEventListener('online', () => scheduleSync(500))
  window.addEventListener('offline', () => setState({ status: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(500)
  })
}
