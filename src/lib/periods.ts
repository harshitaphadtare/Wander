export type Period = 'week' | 'month' | 'year' | 'all'

export const PERIOD_OPTIONS: readonly (readonly [Period, string])[] = [
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
  ['all', 'All'],
]

/** Start of the current week (Monday), month or year; 0 for all time. */
export function periodStart(period: Period, now = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  else if (period === 'month') d.setDate(1)
  else if (period === 'year') d.setMonth(0, 1)
  else return 0
  return d.getTime()
}
