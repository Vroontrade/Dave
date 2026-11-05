import { useMemo } from 'react'
import { useStore } from '../store'
import { monthSummary, savingsStats, reserveStats, upcoming } from '../lib/calc'
import { currentMonth, daysInMonth, formatDate, monthLabel } from '../lib/dates'
import { euro } from '../lib/money'
import { dueReminders } from '../lib/reminders'
import { Bar, List, Money, PageHeader, Pill, Row, Section } from '../components/ui'
import type { Tab } from '../App'

export function Dashboard({ go, openAssistant }: { go: (t: Tab) => void; openAssistant: () => void }) {
  const { data, commit } = useStore()
  const m = currentMonth()
  const s = useMemo(() => monthSummary(data, m), [data, m])
  const sv = useMemo(() => savingsStats(data), [data])
  const rs = useMemo(() => reserveStats(data), [data])
  const up = useMemo(() => upcoming(data).slice(0, 6), [data])
  const reminders = useMemo(() => dueReminders(data), [data])
  const today = new Date().getDate()
  const daysLeft = daysInMonth(m) - today + 1
  const perDay = s.spendingLeft > 0 ? Math.floor(s.spendingLeft / daysLeft) : 0
  const status = (id: string) => s.items.find((i) => i.item.id === id)

  const incomeDay = status('income')?.item.dueDay
  const planRows: { label: string; value: number; done?: boolean; doneLabel?: string; pending?: string }[] = [
    { label: 'Maandinkomen', value: s.planned.income, done: status('income')?.done, doneLabel: 'ontvangen', pending: incomeDay ? `verwacht op de ${incomeDay}e` : undefined },
    { label: 'Vaste lasten', value: s.planned.fixed },
    { label: 'Maandelijks sparen', value: s.planned.savings, done: status('savings')?.done, doneLabel: 'gestort' },
    { label: 'Autoreserve', value: s.planned.reserve, done: status('reserve')?.done, doneLabel: 'gestort' },
  ]

  return (
    <div className="flex flex-col gap-7">
      <PageHeader eyebrow="Finance" title={monthLabel(m)} right={
        <button type="button" onClick={openAssistant} className="mb-1 rounded-full bg-surface px-3.5 py-2 text-[14px] shadow-sm active:bg-sunken">Vraag of meld</button>
      } />

      {reminders.length > 0 && (
        <div className="flex flex-col gap-2">
          {reminders.map((r) => (
            <div key={r.key} className={'flex items-start gap-3 rounded-2xl px-4 py-3 anim-rise ' + (r.tone === 'warning' ? 'bg-warning-soft' : 'bg-surface shadow-sm')}>
              <div className="min-w-0 flex-1">
                <div className={'text-[15px] font-medium ' + (r.tone === 'warning' ? 'text-warning' : '')}>{r.title}</div>
                <div className="text-[14px] text-muted">{r.body}</div>
              </div>
              <button type="button" className="text-[13px] text-muted underline underline-offset-2" onClick={() => void commit((d) => ({ ...d, dismissed: [...d.dismissed, r.key].slice(-300) }))}>Gezien</button>
            </div>
          ))}
        </div>
      )}

      {/* Het getal waar je elke dag naar kijkt */}
      <section className="flex flex-col gap-3 anim-rise" aria-label="Beschikbaar budget">
        <div className="label px-1">Nog vrij te besteden</div>
        <div className="px-1">
          <div className={'num text-[46px] font-semibold leading-none tracking-[-0.035em] ' + (s.spendingLeft < 0 ? 'text-warning' : '')}>{euro(s.spendingLeft)}</div>
          <div className="mt-2 text-[14px] text-muted">
            van <span className="num">{euro(s.planned.available)}</span> beschikbaar budget
            {s.spendingLeft > 0 && <> · ongeveer <span className="num text-ink">{euro(perDay)}</span> per dag voor de resterende {daysLeft} {daysLeft === 1 ? 'dag' : 'dagen'}</>}
          </div>
        </div>
        <Bar className="mx-1 !w-auto" value={Math.max(0, s.spendingLeft)} max={s.planned.available} tone={s.spendingLeft < s.planned.available * 0.15 ? 'warning' : 'success'} />
        {s.items.filter((i) => i.item.kind === 'budget').length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {s.items.filter((i) => i.item.kind === 'budget').map((b) => (
              <button key={b.item.id} type="button" onClick={() => go('maand')} className="panel flex flex-col gap-2 p-3.5 text-left active:opacity-80">
                <div className="flex items-baseline justify-between gap-2"><span className="text-[14px]">{b.item.name}</span>{b.overrun > 0 && <Pill tone="warning">over</Pill>}</div>
                <div className="num text-[17px] font-medium">{euro(b.left)} <span className="text-[13px] font-normal text-muted">over</span></div>
                <Bar value={b.spent} max={b.item.amount} tone={b.overrun > 0 ? 'warning' : 'ink'} />
              </button>
            ))}
          </div>
        )}
      </section>

      <Section title="Maandplan" action={<button type="button" className="text-[13px] text-muted" onClick={() => go('instellingen')}>Aanpassen</button>}>
        <List>
          {planRows.map((r) => (
            <Row key={r.label} left={r.label} right={euro(r.value)} rightSub={r.done !== undefined ? (r.done ? <span className="text-success">{r.doneLabel}</span> : r.pending ?? 'nog niet') : undefined} />
          ))}
          <div className="flex items-center justify-between bg-sunken px-4 py-3.5">
            <span className="text-[15px] font-medium">Beschikbaar budget</span>
            <Money c={s.planned.available} className="text-[17px] font-semibold" />
          </div>
        </List>
      </Section>

      <Section title="Voortgang deze maand" action={<button type="button" className="text-[13px] text-muted" onClick={() => go('maand')}>Checklist</button>}>
        <button type="button" onClick={() => go('maand')} className="panel flex flex-col gap-3 p-4 text-left active:opacity-90">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px]"><span className="num font-semibold">{s.checkedCount}</span> van {s.checkableCount} afgevinkt</span>
            {s.outstanding > 0 ? <span className="text-[14px] text-muted">Nog open <Money c={s.outstanding} className="text-ink" /></span> : <Pill tone="success">alles afgevinkt</Pill>}
          </div>
          <Bar value={s.checkedCount} max={s.checkableCount} tone="success" />
          <div className="grid grid-cols-3 gap-2 text-[13px]">
            <div><div className="text-muted">Inkomen</div><Money c={s.actualIncome} className="text-[15px]" /></div>
            <div><div className="text-muted">Uitgegeven</div><Money c={s.totalExpenses} className="text-[15px]" /></div>
            <div><div className="text-muted">Gespaard</div><Money c={s.savingsNet} className="text-[15px]" /></div>
          </div>
        </button>
      </Section>

      <Section title="Spaardoel" action={<button type="button" className="text-[13px] text-muted" onClick={() => go('sparen')}>Details</button>}>
        <button type="button" onClick={() => go('sparen')} className="panel flex flex-col gap-3 p-4 text-left active:opacity-90">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="num text-[28px] font-semibold leading-none tracking-[-0.03em]">{euro(sv.balance)}</div>
              <div className="mt-1.5 text-[14px] text-muted">van {euro(sv.target, { whole: true })} vóór {formatDate(data.settings.goal.targetDate, { year: true })}</div>
            </div>
            <div className="num text-[22px] font-semibold text-success">{sv.percent.toFixed(1).replace('.', ',')}%</div>
          </div>
          <Bar value={sv.balance} max={sv.target} tone="success" />
          <div className="flex justify-between text-[13px] text-muted">
            <span>Autoreserve <Money c={rs.balance} className="text-ink" /></span>
            <span>Nog nodig p/m <Money c={sv.requiredMonthly} className="text-ink" /></span>
          </div>
        </button>
      </Section>

      <Section title="Komende en openstaande betalingen">
        {up.length === 0 ? (
          <div className="panel p-4 text-[15px] text-muted">Niets meer open deze maand.</div>
        ) : (
          <List>
            {up.map((u) => (
              <Row key={u.month + u.status.item.id} onClick={() => go('maand')} left={u.status.item.name}
                sub={u.date ? (u.inDays! < 0 ? `${formatDate(u.date)} · ${-u.inDays!} dagen te laat` : u.inDays === 0 ? 'Vandaag' : `${formatDate(u.date, { weekday: true })} · over ${u.inDays} ${u.inDays === 1 ? 'dag' : 'dagen'}`) : 'Vervaldatum onbekend'}
                right={euro(u.status.item.amount)} rightSub={u.month !== m ? monthLabel(u.month, false) : u.date && u.inDays! < 0 ? <span className="text-warning">te laat</span> : undefined} />
            ))}
          </List>
        )}
      </Section>
    </div>
  )
}
