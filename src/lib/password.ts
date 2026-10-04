/**
 * Password strength rules and a breach check.
 *
 * The breach check uses Have I Been Pwned's k-anonymity range API (free, no
 * key): only the first 5 hex chars of the password's SHA-1 leave the device,
 * and the match happens locally against the ~800 suffixes that come back.
 */

export const MIN_LENGTH = 10

export interface Rule {
  id: string
  label: string
  test(pw: string): boolean
}

export const RULES: Rule[] = [
  { id: 'len', label: `At least ${MIN_LENGTH} characters`, test: (pw) => pw.length >= MIN_LENGTH },
  { id: 'case', label: 'Upper and lower case letters', test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { id: 'num', label: 'A number', test: (pw) => /\d/.test(pw) },
  { id: 'sym', label: 'A symbol', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
]

const COMMON = /^(password|passw0rd|qwerty|letmein|welcome|iloveyou|admin|wander|abc123|monkey|dragon|football|sunshine)/i

export interface Strength {
  /** 0–4 */
  score: number
  label: string
  passed: Set<string>
  ok: boolean
}

export function strength(pw: string, email = ''): Strength {
  const passed = new Set(RULES.filter((r) => r.test(pw)).map((r) => r.id))
  if (!pw) return { score: 0, label: '', passed, ok: false }

  let score = passed.size
  // Length beyond the minimum is worth more than character variety.
  if (pw.length >= 16) score += 1
  // Penalise the patterns attackers try first.
  const local = email.split('@')[0]?.toLowerCase()
  if (COMMON.test(pw) || (local && local.length > 2 && pw.toLowerCase().includes(local))) score -= 2
  if (/(.)\1{2,}/.test(pw)) score -= 1
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(pw)) score -= 1
  if (!passed.has('len')) score = Math.min(score, 1)

  score = Math.max(0, Math.min(4, score))
  const label = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score]
  return { score, label, passed, ok: passed.size === RULES.length && score >= 3 }
}

async function sha1Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** How many times the password appears in known breaches; null if the check couldn't run. */
export async function breachCount(pw: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const hash = await sha1Hex(pw)
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal,
    })
    if (!res.ok) return null
    const suffix = hash.slice(5)
    for (const line of (await res.text()).split('\n')) {
      const [s, n] = line.trim().split(':')
      if (s === suffix) return Number(n) || 0
    }
    return 0
  } catch {
    return null
  }
}
