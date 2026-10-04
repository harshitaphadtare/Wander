/**
 * Builds every app icon from one drawing of the Wander mark: a "W" drawn as a
 * walking route that ends in a map pin.
 *
 *   npm run icons
 *
 * Writes public/favicon.svg, favicon.ico, the PWA PNGs, the maskable icon and
 * the Apple touch icon. The same geometry is used by <LogoMark> in src/ui/Logo.tsx.
 */
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'

// ---- Geometry (512 × 512 artboard) ----
const ROUTE = 'M108 200C122 290 146 382 188 382C230 382 234 280 252 280C270 280 274 382 316 382C352 382 364 310 370 258'
const PIN = { cx: 370, cy: 160, r: 54, hole: 20 }
const STROKE = 42
const CREAM = '#FFF6EE'

function pinPath({ cx, cy, r }) {
  const tip = cy + 1.62 * r
  return (
    `M${cx} ${tip}C${cx - 0.32 * r} ${cy + 1.18 * r} ${cx - r} ${cy + 0.62 * r} ${cx - r} ${cy}` +
    `A${r} ${r} 0 1 1 ${cx + r} ${cy}C${cx + r} ${cy + 0.62 * r} ${cx + 0.32 * r} ${cy + 1.18 * r} ${cx} ${tip}Z`
  )
}

/** The cream mark, scaled about the centre so it can sit inside a safe zone. */
function mark(scale = 1) {
  const t = scale === 1 ? '' : ` transform="translate(256 256) scale(${scale}) translate(-256 -256)"`
  return `<g${t}>
    <path d="${ROUTE}" fill="none" stroke="${CREAM}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${pinPath(PIN)}" fill="${CREAM}"/>
    <circle cx="${PIN.cx}" cy="${PIN.cy}" r="${PIN.hole}" fill="#EC4A22"/>
  </g>`
}

/** rx = 0 for full-bleed icons the OS masks itself (iOS, Android maskable). */
function icon({ rx, scale }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#FF7A52"/>
      <stop offset="1" stop-color="#E23E1A"/>
    </linearGradient>
    <radialGradient id="hl" cx="0.22" cy="0.12" r="0.85">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${rx}" fill="url(#hl)"/>
  ${mark(scale)}
</svg>
`
}

const rounded = icon({ rx: 116, scale: 1 })
const fullBleed = icon({ rx: 0, scale: 1 })
// Android crops maskable icons to a circle of radius 0.4 × size; 0.8 keeps the pin inside it.
const maskable = icon({ rx: 0, scale: 0.8 })

const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer()

/** A .ico is a tiny directory header followed by PNG images. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, e)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1)
    header.writeUInt16LE(1, e + 4) // colour planes
    header.writeUInt16LE(32, e + 6) // bits per pixel
    header.writeUInt32LE(data.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...images.map((i) => i.data)])
}

const out = (name, data) => {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), data)
  console.log(`  public/${name}`)
}

out('favicon.svg', rounded)
for (const size of [64, 192, 512]) out(`pwa-${size}x${size}.png`, await png(rounded, size))
out('maskable-icon-512x512.png', await png(maskable, 512))
out('apple-touch-icon-180x180.png', await png(fullBleed, 180))
out('favicon.ico', ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(rounded, size) })))))
