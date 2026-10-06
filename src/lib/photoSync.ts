import { notifyLocalChange } from './changes'
import { openBytes, sealBytes } from './crypto'
import { db, getMeta, setMeta, type Photo } from './db'
import { supabase } from './supabase'

/**
 * Photos across your devices.
 *
 * Visit rows already sync their `photoIds`; the pictures themselves go to a
 * private Supabase Storage bucket (`photos`, one folder per account, see
 * supabase/schema.sql). Each image is encrypted on the device with the same
 * per-account key as everything else, so storage only ever holds ciphertext:
 *
 *   photos/<user id>/<photo id>/full    1600 px JPEG, sealed
 *   photos/<user id>/<photo id>/thumb    360 px JPEG, sealed
 *
 * A device uploads photos it hasn't sent yet, downloads ones its visits
 * mention but it doesn't have, and removes ones you deleted.
 */

const BUCKET = 'photos'
const PENDING_DELETES = 'photos:pendingDeletes'
/** Photos another device hasn't uploaded yet: don't ask again for a while. */
const missing = new Map<string, number>()
const RETRY_MISSING_MS = 5 * 60_000

const path = (userId: string, id: string, kind: 'full' | 'thumb') => `${userId}/${id}/${kind}`

/** Remember photos to remove from storage (they may be deleted while offline). */
export async function queuePhotoDeletes(ids: string[]) {
  if (!ids.length || !supabase) return
  const pending = await getMeta<string[]>(PENDING_DELETES, [])
  await setMeta(PENDING_DELETES, [...new Set([...pending, ...ids])])
}

async function upload(userId: string, key: CryptoKey) {
  // One photo in memory at a time: loading every full-size blob at once to find the
  // few not yet uploaded can get the tab killed on an iPhone.
  const ids = await db.photos.toCollection().primaryKeys()
  for (const id of ids) {
    const p = await db.photos.get(id)
    if (!p || p.uploaded === 1) continue
    const thumb = p.thumb ?? p.blob
    const [full, small] = await Promise.all([
      sealBytes(key, p.id, 'full', await p.blob.arrayBuffer()),
      sealBytes(key, p.id, 'thumb', await thumb.arrayBuffer()),
    ])
    for (const [kind, bytes] of [['full', full], ['thumb', small]] as const) {
      const { error } = await supabase!.storage
        .from(BUCKET)
        .upload(path(userId, p.id, kind), bytes, { upsert: true, contentType: 'application/octet-stream' })
      if (error) throw storageError(error)
    }
    await db.photos.update(p.id, { uploaded: 1 })
  }
}

async function download(userId: string, key: CryptoKey) {
  const visits = await db.visits.filter((v) => !v.deleted && !!v.photoIds?.length).toArray()
  const have = new Set(await db.photos.toCollection().primaryKeys())
  const now = Date.now()
  let added = 0
  for (const v of visits) {
    for (const [i, id] of (v.photoIds ?? []).entries()) {
      if (have.has(id) || now - (missing.get(id) ?? 0) < RETRY_MISSING_MS) continue
      const [full, thumb] = await Promise.all([
        supabase!.storage.from(BUCKET).download(path(userId, id, 'full')),
        supabase!.storage.from(BUCKET).download(path(userId, id, 'thumb')),
      ])
      if (full.error || !full.data) {
        // Not uploaded yet (the other device hasn't synced since): try again later.
        missing.set(id, now)
        continue
      }
      let blob: Blob
      let small: Blob | undefined
      try {
        blob = new Blob([await openBytes(key, id, 'full', await full.data.arrayBuffer())], { type: 'image/jpeg' })
        small = thumb.data ? new Blob([await openBytes(key, id, 'thumb', await thumb.data.arrayBuffer())], { type: 'image/jpeg' }) : undefined
      } catch (err) {
        // An unreadable photo must not stop the rest of sync; try it again later.
        console.warn(`[wander] couldn't open photo ${id}`, err)
        missing.set(id, now)
        continue
      }
      const size = await createImageBitmap(blob).then(
        (b) => {
          const s = { width: b.width, height: b.height }
          b.close()
          return s
        },
        () => ({ width: 0, height: 0 }),
      )
      const photo: Photo = { id, visitId: v.id, blob, thumb: small, ...size, createdAt: v.arrivedAt + i, uploaded: 1 }
      await db.photos.put(photo)
      added++
    }
  }
  if (added) notifyLocalChange()
}

async function removeDeleted(userId: string) {
  const pending = await getMeta<string[]>(PENDING_DELETES, [])
  if (!pending.length) return
  const paths = pending.flatMap((id) => [path(userId, id, 'full'), path(userId, id, 'thumb')])
  const { error } = await supabase!.storage.from(BUCKET).remove(paths)
  if (error) throw storageError(error)
  const still = await getMeta<string[]>(PENDING_DELETES, [])
  await setMeta(
    PENDING_DELETES,
    still.filter((id) => !pending.includes(id)),
  )
}

/** Photos whose visit was deleted (here or on another device) go too. */
async function pruneOrphans() {
  const live = new Set((await db.visits.filter((v) => !v.deleted).toArray()).map((v) => v.id))
  // Read just the (visitId, id) index pairs, never the image blobs.
  const byVisit = db.photos.orderBy('visitId')
  const [visitIds, ids] = await Promise.all([byVisit.keys(), byVisit.primaryKeys()])
  const orphans = ids.filter((_, i) => !live.has(String(visitIds[i])))
  if (!orphans.length) return
  await db.photos.bulkDelete(orphans)
  await queuePhotoDeletes(orphans)
  notifyLocalChange()
}

function storageError(error: { message?: string; statusCode?: string | number }) {
  if (/bucket not found/i.test(error.message ?? '')) {
    return new Error('Photo backup needs a server update. Re-run supabase/schema.sql in Supabase.')
  }
  return new Error(error.message || 'Photo backup failed.')
}

/** One pass: send new photos, fetch ones from your other devices, clear deleted ones. */
export async function syncPhotos(userId: string, key: CryptoKey) {
  if (!supabase) return
  await pruneOrphans()
  await removeDeleted(userId)
  await upload(userId, key)
  await download(userId, key)
}
