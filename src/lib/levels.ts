export type LevelKey = 'saved' | 'visited' | 'favourite' | 'regular' | 'legend'

export interface Level {
  key: LevelKey
  label: string
  /** solid colour for pins, tiles and badges */
  color: string
  /** visits needed to reach this level */
  min: number
}

// Ordered lowest → highest. Icons live in ui/icons.tsx.
export const LEVELS: Level[] = [
  { key: 'saved', label: 'Want to go', color: '#8C877E', min: 0 },
  { key: 'visited', label: 'Visited', color: '#12A187', min: 1 },
  { key: 'favourite', label: 'Favourite', color: '#F29D0C', min: 2 },
  { key: 'regular', label: 'Regular', color: '#E8457A', min: 5 },
  { key: 'legend', label: 'Local legend', color: '#7357F6', min: 10 },
]

export function levelFor(visitCount: number): Level {
  let result = LEVELS[0]
  for (const level of LEVELS) if (visitCount >= level.min) result = level
  return result
}

export function nextLevel(visitCount: number): Level | undefined {
  return LEVELS.find((l) => l.min > visitCount)
}
