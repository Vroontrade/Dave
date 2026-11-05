import type { AppData, Reminder } from './types'
import { TX_LABEL } from './actions'
import { addMonths, currentMonth, pad } from './dates'

/** CSV in Nederlands formaat: puntkomma als scheidingsteken, komma als decimaalteken (opent direct goed in Numbers/Excel NL). */
export function transactionsCSV(data: AppData): string {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rows = [['Datum', 'Boekmaand', 'Soort', 'Categorie', 'Omschrijving', 'Bedrag', 'Status', 'Bron', 'Aangemaakt']]
  const list = [...data.transactions].sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt))
  for (const t of list) {
    const sign = ['expense', 'savings_withdrawal', 'reserve_expense'].includes(t.type) ? -1 : 1
    rows.push([t.date, t.month, TX_LABEL[t.type], t.category, t.note, ((sign * t.amount) / 100).toFixed(2).replace('.', ','), t.deletedAt ? 'Verwijderd' : 'Actief', t.source, t.createdAt])
  }
  return '\ufeff' + rows.map((r) => r.map((c) => esc(String(c ?? ''))).join(';')).join('\r\n')
}

const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function icsEscape(s: string) { return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n') }

/** Agenda-bestand met terugkerende afspraken en meldingen. Na importeren in de iPhone Agenda krijg je echte iOS-meldingen.
 *  Alleen herinneringen met een ingestelde dag worden opgenomen; rekeningen alleen als hun vervaldag bekend is. */
export function remindersICS(data: AppData, now = new Date()): { ics: string; count: number; skipped: string[] } {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Finance//NL', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Finance']
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const first = currentMonth(now)
  const skipped: string[] = []
  let count = 0

  const event = (uidPart: string, title: string, desc: string, startDate: string, time: string, rrule: string, alarmMinutes = 0) => {
    const [h, m] = time.split(':')
    const dt = startDate.replace(/-/g, '') + 'T' + pad(Number(h)) + pad(Number(m)) + '00'
    lines.push('BEGIN:VEVENT', `UID:fr-${uidPart}@financial-reset`, `DTSTAMP:${stamp}`, `DTSTART:${dt}`, 'DURATION:PT15M', `RRULE:${rrule}`, `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, `TRIGGER:-PT${alarmMinutes}M`, 'END:VALARM', 'END:VEVENT')
    count++
  }
  const monthly = (day: number) => `FREQ=MONTHLY;BYMONTHDAY=${Math.min(day, 28) === day ? day : -1}`
  const firstDate = (day: number) => {
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const d = `${first}-${pad(Math.min(day, 28))}`
    return d >= today ? d : `${addMonths(first, 1)}-${pad(Math.min(day, 28))}`
  }

  const items = data.settings.items.filter((i) => i.active)
  for (const r of data.settings.reminders) {
    if (!r.enabled) continue
    if (r.kind === 'weekly') {
      if (r.weekday == null) { skipped.push(r.label); continue }
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      while (d.getDay() !== r.weekday) d.setDate(d.getDate() + 1)
      event(r.id, r.label, 'Open Finance en bekijk je budget van deze week.', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, r.time, `FREQ=WEEKLY;BYDAY=${DAY[r.weekday]}`)
      continue
    }
    if (r.kind === 'bills') {
      for (const it of items.filter((i) => i.kind === 'bill')) {
        if (it.dueDay == null) { skipped.push(`${it.name} (vervaldag onbekend)`); continue }
        const day = Math.max(1, it.dueDay - r.daysBefore)
        event(`${r.id}-${it.id}`, `${it.name} vervalt op de ${it.dueDay}e`, `Vink de betaling af in Finance zodra ${it.name} betaald is.`, firstDate(day), r.time, monthly(day))
      }
      continue
    }
    let day = r.day
    if (r.kind === 'salary') day = r.day ?? items.find((i) => i.kind === 'income')?.dueDay ?? null
    if (r.kind === 'savings') day = r.day ?? items.find((i) => i.kind === 'savings')?.dueDay ?? null
    if (day == null) { skipped.push(r.label); continue }
    event(r.id, r.label, 'Open Finance om dit af te vinken.', firstDate(day), r.time, monthly(day))
  }
  lines.push('END:VCALENDAR')
  return { ics: lines.join('\r\n'), count, skipped }
}

export function reminderDay(r: Reminder, data: AppData): number | null {
  if (r.day != null) return r.day
  if (r.kind === 'salary') return data.settings.items.find((i) => i.kind === 'income')?.dueDay ?? null
  if (r.kind === 'savings') return data.settings.items.find((i) => i.kind === 'savings')?.dueDay ?? null
  return null
}

interface DownloadsNS { save(o: { filename: string; data: Blob | string }): Promise<unknown> }

/** Bestand aanbieden: binnen Claude via de downloads-capability, anders via een gewone download. */
export async function offerFile(filename: string, content: string, mime: string): Promise<'saved' | 'shared' | 'failed'> {
  try {
    if (window.claude?.use) {
      const dl = (await window.claude.use('downloads')) as DownloadsNS | null
      if (dl) { await dl.save({ filename, data: new Blob([content], { type: mime }) }); return 'saved' }
    }
  } catch { return 'failed' }
  try {
    const file = new File([content], filename, { type: mime })
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
    if (nav.canShare?.({ files: [file] }) && /iPhone|iPad/.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return 'saved'
  } catch { return 'failed' }
}
