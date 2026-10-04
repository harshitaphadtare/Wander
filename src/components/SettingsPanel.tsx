import { ChevronRight, Cloud, Download, LogOut, Radar, RefreshCw, Share, SquarePlus, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { exportBackup, importBackup, saveBackupFile } from '../lib/backup'
import { plural, relativeTime } from '../lib/format'
import { openAuth, signOut } from '../lib/auth'
import { syncNow, syncStore } from '../lib/sync'
import { useConfirm } from '../ui/Confirm'
import Sheet from '../ui/Sheet'
import { AppIcon } from '../ui/Logo'

interface Props {
  placeCount: number
  visitCount: number
  autoDetect: boolean
  onAutoDetect(on: boolean): void
  notify(text: string, tone?: 'info' | 'success' | 'error'): void
  onClose(): void
}

const isStandalone =
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)

function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="group">
      {title && <div className="list-label">{title}</div>}
      <div className="group-card">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <motion.span layout className="switch-knob" transition={{ type: 'spring', stiffness: 700, damping: 35 }} />
    </button>
  )
}

export default function SettingsPanel({ placeCount, visitCount, autoDetect, onAutoDetect, notify, onClose }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const doExport = async () => {
    setBusy(true)
    try {
      const { file, counts } = await exportBackup()
      await saveBackupFile(file)
      notify(`Backup ready: ${plural(counts.places, 'place')}, ${plural(counts.visits, 'visit')}`, 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const doImport = async (file: File) => {
    setBusy(true)
    try {
      const changed = await importBackup(file)
      notify(changed ? `Restored ${plural(changed, 'item')}` : 'Everything in that backup was already here', 'success')
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <Sheet onClose={onClose} eyebrow={`${plural(placeCount, 'place')} · ${plural(visitCount, 'visit')}`} title="Settings">
      {!isStandalone && (
        <motion.div className="install-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <img src="/pwa-192x192.png" alt="" width={48} height={48} />
          <div>
            <strong>Add Wander to your Home Screen</strong>
            {isIOS ? (
              <p>
                Tap <Share size={14} className="inline-icon" /> <b>Share</b>, then <SquarePlus size={14} className="inline-icon" />{' '}
                <b>Add to Home Screen</b>. It opens full-screen, works offline and keeps your data safe.
              </p>
            ) : (
              <p>Use your browser's “Install app” option for a full-screen, offline app.</p>
            )}
          </div>
        </motion.div>
      )}

      <Group
        title="Visits"
        footer="While Wander is on screen, staying ~75 m from one spot for 10+ minutes logs a visit. iPhone doesn't let web apps use location once they're closed, so the “You're at…” card offers a one-tap check-in whenever you open the app."
      >
        <div className="group-row">
          <span className="group-icon" style={{ background: '#12A187' }}>
            <Radar size={16} strokeWidth={2.4} />
          </span>
          <span className="group-label">Auto-detect visits</span>
          <Switch checked={autoDetect} onChange={onAutoDetect} label="Auto-detect visits" />
        </div>
      </Group>

      <SyncGroup />

      <Group title="Your data" footer="Backups merge on import, so newer changes are never overwritten.">
        <button className="group-row" onClick={doExport} disabled={busy}>
          <span className="group-icon" style={{ background: '#2F7BF6' }}>
            <Download size={16} strokeWidth={2.4} />
          </span>
          <span className="group-label">Export backup</span>
          <ChevronRight size={16} className="row-chev" />
        </button>
        <button className="group-row" onClick={() => fileInput.current?.click()} disabled={busy}>
          <span className="group-icon" style={{ background: '#7357F6' }}>
            <Upload size={16} strokeWidth={2.4} />
          </span>
          <span className="group-label">Import backup</span>
          <ChevronRight size={16} className="row-chev" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
        />
      </Group>

      <p className="colophon">
        <AppIcon size={44} />
        <span className="display">Wander</span>
        Map © OpenFreeMap · OpenMapTiles · OpenStreetMap contributors. Search by Photon.
      </p>
    </Sheet>
  )
}

function SyncGroup() {
  const confirm = useConfirm()
  const sync = useSyncExternalStore(syncStore.subscribe, syncStore.get)

  const icon = (
    <span className="group-icon" style={{ background: '#F29D0C' }}>
      <Cloud size={16} strokeWidth={2.4} />
    </span>
  )

  if (sync.status === 'disabled') {
    return (
      <Group title="Sync" footer="Add a free Supabase project to sync your phone and laptop (see docs/SETUP.md).">
        <div className="group-row">
          {icon}
          <span className="group-label">Sync across devices</span>
          <span className="group-value">Off</span>
        </div>
      </Group>
    )
  }

  if (sync.status === 'signed-out') {
    return (
      <Group title="Sync" footer="Sign in with Google or email to keep your phone and laptop in sync. Everything is encrypted on this device before upload.">
        <button className="group-row" onClick={() => openAuth('signin')}>
          {icon}
          <span className="group-label">Sign in to sync</span>
          <ChevronRight size={16} className="row-chev" />
        </button>
        <button className="group-row subtle" onClick={() => openAuth('signup')}>
          <span className="group-label">New here? Create an account</span>
        </button>
      </Group>
    )
  }

  const status: Record<string, string> = {
    idle: sync.lastSyncedAt ? `Synced ${relativeTime(sync.lastSyncedAt)}` : 'Up to date',
    syncing: 'Syncing…',
    offline: 'Waiting for connection',
    error: 'Problem syncing',
  }

  return (
    <Group title="Sync" footer={sync.status === 'error' ? sync.error : `Signed in as ${sync.email}`}>
      <button className="group-row" onClick={() => void syncNow()} disabled={sync.status === 'syncing'}>
        {icon}
        <span className="group-label">Sync now</span>
        <span className={`group-value ${sync.status === 'error' ? 'error' : ''}`}>{status[sync.status]}</span>
        <RefreshCw size={15} className={`row-chev ${sync.status === 'syncing' ? 'spin' : ''}`} />
      </button>
      <button
        className="group-row"
        onClick={async () => {
          if (await confirm({ title: 'Sign out of sync?', message: 'Your data stays on this device.', confirmLabel: 'Sign out' })) void signOut()
        }}
      >
        <span className="group-icon" style={{ background: '#8C877E' }}>
          <LogOut size={16} strokeWidth={2.4} />
        </span>
        <span className="group-label">Sign out</span>
      </button>
    </Group>
  )
}
