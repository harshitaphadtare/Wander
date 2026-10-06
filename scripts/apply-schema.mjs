/**
 * Keeps the Supabase database in step with the app: on every *production*
 * deploy on Vercel, this sends supabase/schema.sql to your Supabase project
 * through Supabase's Management API, inside one transaction (all or nothing).
 *
 * schema.sql is written to be re-runnable (if-not-exists, create-or-replace,
 * drop-then-create), so running it on every production deploy is harmless.
 *
 * Needs one Vercel environment variable: SUPABASE_ACCESS_TOKEN (Supabase →
 * Account → Access Tokens). The project is worked out from VITE_SUPABASE_URL.
 *
 * It never fails the build: if anything goes wrong it prints a warning and the
 * app still deploys. Preview and local builds skip it entirely.
 *
 * Run it by hand with: SUPABASE_ACCESS_TOKEN=... VITE_SUPABASE_URL=... node scripts/apply-schema.mjs --force
 */
import { readFile } from 'node:fs/promises'

const log = (msg) => console.log(`[schema] ${msg}`)
const warn = (msg) => console.warn(`[schema] WARNING: ${msg}`)

async function main() {
  const forced = process.argv.includes('--force')
  if (!forced && process.env.VERCEL_ENV !== 'production') {
    log(process.env.VERCEL ? `skipped (${process.env.VERCEL_ENV} build; only production updates the database)` : 'skipped (not a Vercel production build)')
    return
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!token) {
    warn('SUPABASE_ACCESS_TOKEN is not set, so supabase/schema.sql was not applied. See docs/SETUP.md.')
    return
  }

  const ref = process.env.SUPABASE_PROJECT_REF?.trim() || projectRef(process.env.VITE_SUPABASE_URL)
  if (!ref) {
    warn('Could not tell which Supabase project to update: VITE_SUPABASE_URL should look like https://<project>.supabase.co.')
    return
  }

  const sql = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60_000)
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // One transaction: if any statement fails, nothing changes.
      body: JSON.stringify({ query: `begin;\n${sql}\ncommit;` }),
      signal: ctrl.signal,
    })
    if (res.ok) {
      log(`supabase/schema.sql applied to project ${ref}.`)
      return
    }
    const detail = (await res.text()).slice(0, 500)
    if (res.status === 401 || res.status === 403) {
      warn(`Supabase refused the access token (${res.status}). Create a new one and update SUPABASE_ACCESS_TOKEN in Vercel. ${detail}`)
    } else {
      warn(`Supabase returned ${res.status}; the database was not changed. ${detail}`)
    }
  } catch (err) {
    warn(`Couldn't reach Supabase (${err.name === 'AbortError' ? 'timed out' : err.message}); the database was not changed.`)
  } finally {
    clearTimeout(timer)
  }
}

/** "https://abcdefgh.supabase.co" → "abcdefgh" */
function projectRef(url) {
  try {
    const host = new URL(url.trim()).hostname
    return host.endsWith('.supabase.co') ? host.split('.')[0] : null
  } catch {
    return null
  }
}

// Never fail the deploy over this.
main().catch((err) => warn(err?.message ?? String(err)))
