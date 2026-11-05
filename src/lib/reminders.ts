import type { AppData } from './types'
import { monthSummary } from './calc'
import { reminderDay } from './exporters'
import { currentMonth, dateInMonth, daysUntil, todayISO } from './dates'
import { euro } from './money'

export interface DueReminder { key: string; title: string; body: string; tone: 'info' | 'warning' }

/** Welke herinneringen zijn vandaag actief? Wordt berekend bij het openen van de app (betrouwbaar op elke iPhone). */
export function dueReminders(data: AppData, now = new Date()): DueReminder[] {
  const out: DueReminder[] = []
  const m = currentMonth(now)
  const today = todayISO(now)
  const s = monthSummary(data, m)
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const done = (id: string) => s.items.find((i) => i.item.id === id)?.done ?? false

  for (const r of data.settings.reminders) {
    if (!r.enabled) continue
    const key = `${r.id}:${today}`
    const day = reminderDay(r, data)
    const timeReached = hhmm >= r.time
    switch (r.kind) {
      case 'salary':
        if (day != null && now.getDate() >= day && !done('income') && (now.getDate() > day || timeReached))
          out.push({ key: `${r.id}:${m}`, title: 'Salaris verwacht', body: 'Is je salaris binnen? Vink het af in je maandoverzicht.', tone: 'info' })
        break
      case 'savings':
        if (day != null && now.getDate() >= day && !done('savings') && (now.getDate() > day || timeReached))
          out.push({ key: `${r.id}:${m}`, title: 'Spaaroverboeking', body: `Maak ${euro(s.items.find((i) => i.item.id === 'savings')?.item.amount ?? 0)} over naar je spaarrekening.`, tone: 'info' })
        break
      case 'bills':
        for (const st of s.outstandingItems) {
          if (st.item.kind !== 'bill' || st.item.dueDay == null) continue
          const d = daysUntil(dateInMonth(m, st.item.dueDay), now)
          if (d <= r.daysBefore && d >= -31)
            out.push({ key: `${r.id}:${st.item.id}:${m}`, title: d < 0 ? `${st.item.name} is te laat` : d === 0 ? `${st.item.name} vervalt vandaag` : `${st.item.name} vervalt over ${d} ${d === 1 ? 'dag' : 'dagen'}`, body: `${euro(st.item.amount)} staat nog open.`, tone: d <= 0 ? 'warning' : 'info' })
        }
        break
      case 'outstanding':
        if (day != null && now.getDate() >= day && s.outstanding > 0)
          out.push({ key: `${r.id}:${m}`, title: 'Nog openstaande posten', body: `${s.outstandingItems.length} ${s.outstandingItems.length === 1 ? 'post' : 'posten'} (${euro(s.outstanding)}) nog niet afgevinkt.`, tone: 'warning' })
        break
      case 'weekly':
        if (r.weekday != null && now.getDay() === r.weekday && timeReached)
          out.push({ key, title: 'Wekelijkse budgetcheck', body: `Je kunt deze maand nog ${euro(s.spendingLeft)} vrij uitgeven.`, tone: 'info' })
        break
      case 'monthly':
        if (day != null && now.getDate() >= day)
          out.push({ key: `${r.id}:${m}`, title: 'Maandreview', body: 'Loop je maandoverzicht door en controleer je spaardoel.', tone: 'info' })
        break
    }
  }
  return out.filter((r) => !data.dismissed.includes(r.key))
}
