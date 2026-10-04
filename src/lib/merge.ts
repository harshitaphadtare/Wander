import { db, type SyncedTable } from './db'

interface Row {
  id: string
  updatedAt: number
  [k: string]: unknown
}

/**
 * Last-write-wins merge of incoming rows into a local table.
 * `markDirty` = true for imports (so they get pushed to the cloud), false for rows
 * pulled from the cloud (already there). Returns how many rows changed.
 */
export async function mergeRows(table: SyncedTable, rows: Row[], markDirty: boolean): Promise<number> {
  if (rows.length === 0) return 0
  const t = db.table(table)
  return db.transaction('rw', t, async () => {
    const existing = await t.bulkGet(rows.map((r) => r.id))
    const toPut = rows
      .filter((row, i) => {
        const local = existing[i] as Row | undefined
        return !local || row.updatedAt > local.updatedAt
      })
      .map((row) => ({ ...row, deleted: row.deleted ? 1 : 0, dirty: markDirty ? 1 : 0 }))
    if (toPut.length) await t.bulkPut(toPut)
    return toPut.length
  })
}
