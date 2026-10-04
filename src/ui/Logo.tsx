/**
 * The Wander mark: a "W" drawn as a walking route that ends in a map pin.
 * Same geometry as the app icons (scripts/icons.mjs); keep the two in sync.
 */
const ROUTE = 'M108 200C122 290 146 382 188 382C230 382 234 280 252 280C270 280 274 382 316 382C352 382 364 310 370 258'
// Pin centred on (370, 160), radius 54, with a 20-unit hole cut out (evenodd).
const PIN =
  'M370 247.48C352.72 223.72 316 193.48 316 160A54 54 0 1 1 424 160C424 193.48 387.28 223.72 370 247.48Z' +
  'M350 160a20 20 0 1 0 40 0a20 20 0 1 0-40 0Z'

/** One-colour mark (inherits `color`), cropped tight for use inline next to text. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="85 84 340 340" fill="none" aria-hidden>
      <path d={ROUTE} stroke="currentColor" strokeWidth={42} strokeLinecap="round" strokeLinejoin="round" />
      <path d={PIN} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

/** The full-colour app icon (as on the home screen). */
export function AppIcon({ size = 40 }: { size?: number }) {
  return <img src="/favicon.svg" width={size} height={size} alt="" className="app-icon" draggable={false} />
}
