import { notifyLocalChange } from './changes'
import { db, type Photo } from './db'

/**
 * Visit photos live only on this device: they're resized to at most 1600 px on
 * the long edge (JPEG ~80%) so a year of check-ins doesn't fill the phone, and
 * never sync. Only the photo ids ride along on the visit row.
 */
const MAX_EDGE = 1600
const QUALITY = 0.8

const THUMB_EDGE = 360

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
  if (!blob) throw new Error('Couldn’t read that photo.')
  return { blob, width, height }
}

async function resize(file: File): Promise<{ blob: Blob; thumb: Blob; width: number; height: number }> {
  // createImageBitmap honours EXIF orientation, so portrait iPhone shots stay upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const full = await encode(bitmap, MAX_EDGE, QUALITY)
    const small = await encode(bitmap, THUMB_EDGE, 0.75)
    return { blob: full.blob, thumb: small.blob, width: full.width, height: full.height }
  } finally {
    bitmap.close()
  }
}

export async function addPhotos(visitId: string, files: FileList | File[]): Promise<number> {
  const added: Photo[] = []
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue
    const { blob, thumb, width, height } = await resize(file)
    added.push({ id: crypto.randomUUID(), visitId, blob, thumb, width, height, createdAt: Date.now() })
  }
  if (!added.length) return 0
  await db.transaction('rw', db.photos, db.visits, async () => {
    await db.photos.bulkAdd(added)
    const visit = await db.visits.get(visitId)
    if (visit) {
      await db.visits.update(visitId, {
        photoIds: [...(visit.photoIds ?? []), ...added.map((p) => p.id)],
        updatedAt: Date.now(),
        dirty: 1,
      })
    }
  })
  notifyLocalChange()
  return added.length
}

export async function removePhoto(photo: Photo) {
  await db.transaction('rw', db.photos, db.visits, async () => {
    await db.photos.delete(photo.id)
    const visit = await db.visits.get(photo.visitId)
    if (visit) {
      await db.visits.update(photo.visitId, {
        photoIds: (visit.photoIds ?? []).filter((id) => id !== photo.id),
        updatedAt: Date.now(),
        dirty: 1,
      })
    }
  })
  notifyLocalChange()
}

/** Free the space when a visit goes away. */
export async function removePhotosFor(visitIds: string[]) {
  if (visitIds.length) await db.photos.where('visitId').anyOf(visitIds).delete()
}
