export type MonthKey = string // "2027-01"

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
export const WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

export function pad(n: number) { return String(n).padStart(2, '0') }

export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
export function monthOf(dateISO: string): MonthKey { return dateISO.slice(0, 7) }
export function currentMonth(now = new Date()): MonthKey { return monthOf(todayISO(now)) }

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split('-').map(Number)
  const idx = y * 12 + (mo - 1) + n
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`
}
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb * 12 + mb) - (ya * 12 + ma)
}
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  for (let m = from; monthsBetween(m, to) >= 0; m = addMonths(m, 1)) out.push(m)
  return out
}
export function monthLabel(m: MonthKey, withYear = true): string {
  const [y, mo] = m.split('-').map(Number)
  const name = MONTHS[mo - 1]
  return withYear ? `${name} ${y}` : name
}
export function monthShort(m: MonthKey): string {
  return MONTHS_SHORT[Number(m.split('-')[1]) - 1]
}
export function daysInMonth(m: MonthKey): number {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo, 0).getDate()
}
/** Datum in maand m op dag d, afgekapt op de laatste dag van de maand (bijv. 31 → 28 feb). */
export function dateInMonth(m: MonthKey, day: number): string {
  return `${m}-${pad(Math.min(day, daysInMonth(m)))}`
}
export function formatDate(iso: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, mo, d] = iso.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  let s = `${d} ${MONTHS_SHORT[mo - 1]}`
  if (opts.year) s += ` ${y}`
  if (opts.weekday) s = WEEKDAYS[dt.getDay()].slice(0, 2) + ' ' + s
  return s
}
export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}
export function daysUntil(iso: string, now = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number)
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const b = new Date(y, m - 1, d).getTime()
  return Math.round((b - a) / 86400000)
}
