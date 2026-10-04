import { notifyLocalChange } from './changes'
import { db, SYNCED_TABLES, withoutDirty } from './db'
import { mergeRows } from './merge'

interface BackupFile {
  app: 'wander'
  version: 1
  exportedAt: string
  places: unknown[]
  visits: unknown[]
  walks: unknown[]
  picks: unknown[]
}

export async function exportBackup(): Promise<{ file: File; counts: { places: number; visits: number } }> {
  const [places, visits, walks, picks] = await Promise.all(
    SYNCED_TABLES.map((t) => db.table(t).toArray().then((rows) => rows.map(withoutDirty))),
  )
  const backup: BackupFile = {
    app: 'wander',
    version: 1,
    exportedAt: new Date().toISOString(),
    places,
    visits,
    walks,
    picks,
  }
  const date = new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
  const file = new File([JSON.stringify(backup, null, 2)], `wander-backup-${date}.json`, {
    type: 'application/json',
  })
  const live = (rows: unknown[]) => rows.filter((r) => !(r as { deleted?: number }).deleted).length
  return { file, counts: { places: live(places), visits: live(visits) } }
}

/** Share sheet on phones (Save to Files / AirDrop), plain download elsewhere. */
export async function saveBackupFile(file: File) {
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [file], title: 'Wander backup' })
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      // Fall through to download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function importBackup(file: File): Promise<number> {
  let data: Partial<BackupFile>
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't valid JSON.")
  }
  if (data.app !== 'wander') throw new Error("That doesn't look like a Wander backup.")
  let changed = 0
  for (const table of SYNCED_TABLES) {
    const rows = data[table]
    if (Array.isArray(rows)) changed += await mergeRows(table, rows as never, true)
  }
  if (changed) notifyLocalChange()
  return changed
}
