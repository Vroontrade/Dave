import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { monthSummary, type ItemStatus } from '../lib/calc'
import { addMonths, currentMonth, dateInMonth, daysInMonth, formatDate, monthLabel, monthRange, monthShort, todayISO, WEEKDAYS, pad } from '../lib/dates'
import { centsToInput, euro, parseAmount } from '../lib/money'
import { toggleItem, updateMonthItem, updateSettings, TX_LABEL } from '../lib/actions'
import { Bar, Button, Check, Field, List, Money, PageHeader, Pill, Section, Segmented, Sheet, inputCls } from '../components/ui'
import { TxEditor, type TxPreset } from '../components/TxEditor'
import type { Transaction } from '../lib/types'

const KIND_LABEL = { income: 'Inkomen', bill: 'Vaste lasten', budget: 'Budgetten', savings: 'Sparen en reserveren', reserve: 'Sparen en reserveren' } as const

/** Standaard betaaldatum bij afvinken: vandaag in de lopende maand, anders de vervaldag of een randdag van die maand. */
export function defaultPayDate(m: string, dueDay: number | null) {
  const cur = currentMonth()
  if (m === cur) return todayISO()
  if (dueDay) return dateInMonth(m, dueDay)
  return m < cur ? `${m}-${pad(daysInMonth(m))}` : `${m}-01`
}

export function MonthPage() {
  const { data } = useStore()
  const [m, setM] = useState(currentMonth())
  const [view, setView] = useState<'lijst' | 'kalender'>('lijst')
  const months = useMemo(() => {
    const end = currentMonth() > '2027-12' ? addMonths(currentMonth(), 2) : '2027-12'
    const start = [data.settings.startMonth, ...Object.keys(data.months)].sort()[0]
    return monthRange(start < '2026-01' ? '2026-01' : start, end)
  }, [data.settings.startMonth, data.months])
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => { stripRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [m])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Maandoverzicht" title={monthLabel(m)} />
      <div ref={stripRef} className="scroll-x -mx-4 flex gap-1.5 px-4">
        {months.map((x) => (
          <button key={x} type="button" data-active={x === m} onClick={() => setM(x)}
            className={'shrink-0 rounded-full px-3.5 py-2 text-[14px] transition-colors ' + (x === m ? 'bg-accent text-accent-ink' : x === currentMonth() ? 'bg-surface font-medium shadow-sm' : 'text-muted')}>
            {monthShort(x)}{x.slice(0, 4) !== currentMonth().slice(0, 4) || x.endsWith('-01') ? ` ${x.slice(2, 4)}` : ''}
          </button>
        ))}
      </div>
      <Segmented value={view} onChange={setView} options={[{ value: 'lijst', label: 'Checklist' }, { value: 'kalender', label: 'Kalender' }]} />
      {view === 'lijst' ? <Checklist m={m} /> : <Calendar m={m} />}
    </div>
  )
}

function Checklist({ m }: { m: string }) {
  const { data, commit } = useStore()
  const s = useMemo(() => monthSummary(data, m), [data, m])
  const [detail, setDetail] = useState<string | null>(null)
  const [preset, setPreset] = useState<TxPreset | null>(null)
  const groups: { title: string; items: ItemStatus[] }[] = []
  for (const st of s.items) {
    const title = KIND_LABEL[st.item.kind]
    let g = groups.find((x) => x.title === title)
    if (!g) groups.push((g = { title, items: [] }))
    g.items.push(st)
  }

  async function toggle(st: ItemStatus) {
    const verb = st.item.kind === 'income' ? 'ontvangen' : st.item.kind === 'budget' ? 'afgesloten' : st.item.kind === 'bill' ? 'betaald' : 'overgemaakt'
    await commit((d) => toggleItem(d, m, st.item.id, { date: defaultPayDate(m, st.item.dueDay) }).data, {
      success: st.done ? `${st.item.name}: afvinken ongedaan gemaakt` : `${st.item.name} ${verb}`,
      undoable: true,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="panel grid grid-cols-3 gap-3 p-4 text-[13px]">
        <div><div className="text-muted">Afgevinkt</div><div className="num text-[17px] font-semibold">{s.checkedCount}/{s.checkableCount}</div></div>
        <div><div className="text-muted">Nog open</div><Money c={s.outstanding} className="text-[17px] font-semibold" /></div>
        <div><div className="text-muted">Vrij over</div><Money c={s.spendingLeft} className={'text-[17px] font-semibold ' + (s.spendingLeft < 0 ? 'text-warning' : '')} /></div>
        <div className="col-span-3"><Bar value={s.checkedCount} max={s.checkableCount} tone="success" /></div>
      </div>

      {groups.map((g) => (
        <Section key={g.title} title={g.title}>
          <List>
            {g.items.map((st) => (
              <div key={st.item.id} className="flex items-center gap-1 pl-2">
                <button type="button" aria-label={(st.done ? 'Ongedaan maken: ' : 'Afvinken: ') + st.item.name} aria-pressed={st.done} onClick={() => void toggle(st)} className="grid h-[56px] w-11 place-items-center">
                  <Check on={st.done} />
                </button>
                <button type="button" onClick={() => setDetail(st.item.id)} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left active:opacity-70">
                  <div className="min-w-0 flex-1">
                    <div className={'truncate text-[15px] ' + (st.done && st.item.kind !== 'budget' ? 'text-muted' : '')}>{st.item.name}</div>
                    <div className="truncate text-[12.5px] text-muted">
                      {st.item.kind === 'budget'
                        ? <>Besteed <span className="num">{euro(st.spent)}</span>{st.overrun > 0 ? <span className="text-warning"> · {euro(st.overrun)} over budget</span> : <> · <span className="num">{euro(st.left)}</span> over</>}</>
                        : st.tx ? `${st.item.kind === 'income' ? 'Ontvangen' : st.item.kind === 'bill' ? 'Betaald' : 'Overgemaakt'} op ${formatDate(st.tx.date)}${st.tx.amount !== st.item.amount ? ` · ${euro(st.tx.amount)}` : ''}`
                        : st.item.dueDay ? `Verwacht op de ${st.item.dueDay}e` : 'Datum onbekend'}
                    </div>
                    {st.item.kind === 'budget' && <Bar className="mt-1.5" value={st.spent} max={st.item.amount} tone={st.overrun > 0 ? 'warning' : 'ink'} />}
                  </div>
                  <span className="num shrink-0 text-[15px]">{euro(st.item.amount)}</span>
                </button>
              </div>
            ))}
          </List>
          {g.title === 'Budgetten' && (
            <div className="flex gap-2">
              {g.items.map((st) => <Button key={st.item.id} variant="secondary" className="flex-1 !min-h-[42px] text-[14px]" onClick={() => setPreset({ type: 'expense', itemId: st.item.id, month: m, category: st.item.name, note: st.item.name })}>+ {st.item.name}</Button>)}
            </div>
          )}
        </Section>
      ))}

      <Section title="Overige uitgaven deze maand">
        <OtherTx m={m} />
        <Button variant="secondary" onClick={() => setPreset({ type: 'expense', month: m })}>+ Vrije uitgave</Button>
      </Section>
      <p className="px-1 text-[13px] text-muted">Tik op het rondje om af te vinken. Opnieuw tikken maakt het ongedaan; de betaling gaat dan naar de prullenbak. Budgetposten vink je af om de maand voor dat budget af te sluiten.</p>

      <ItemSheet m={m} itemId={detail} onClose={() => setDetail(null)} />
      <TxEditor open={!!preset} preset={preset ?? undefined} onClose={() => setPreset(null)} />
    </div>
  )
}

function OtherTx({ m }: { m: string }) {
  const { data } = useStore()
  const [edit, setEdit] = useState<Transaction | null>(null)
  const plan = monthSummary(data, m).plan
  // Alles behalve de afgevinkte checklist-betalingen zelf: budgetuitgaven, vrije uitgaven en extra stortingen.
  const single = new Set(plan.items.filter((i) => i.kind !== 'budget').map((i) => i.id))
  const all = data.transactions.filter((t) => !t.deletedAt && t.month === m && !(t.itemId && single.has(t.itemId))).sort((a, b) => b.date.localeCompare(a.date))
  if (all.length === 0) return <div className="panel p-4 text-[14px] text-muted">Nog geen losse uitgaven of extra stortingen.</div>
  return (
    <>
      <List>
        {all.map((t) => (
          <button key={t.id} type="button" onClick={() => setEdit(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken">
            <div className="min-w-0 flex-1"><div className="truncate text-[15px]">{t.note || t.category}</div><div className="text-[12.5px] text-muted">{formatDate(t.date)} · {t.itemId ? t.category : TX_LABEL[t.type]}</div></div>
            <span className="num text-[15px]">{['expense', 'savings_withdrawal', 'reserve_expense'].includes(t.type) ? '−' : '+'}{euro(t.amount)}</span>
          </button>
        ))}
      </List>
      <TxEditor open={!!edit} tx={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function ItemSheet({ m, itemId, onClose }: { m: string; itemId: string | null; onClose: () => void }) {
  const { data, commit } = useStore()
  const st = itemId ? monthSummary(data, m).items.find((i) => i.item.id === itemId) : undefined
  const [amount, setAmount] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [due, setDue] = useState('')
  const [allMonths, setAllMonths] = useState(true)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!st) return
    setAmount(centsToInput(st.item.amount)); setPayAmount(centsToInput(st.item.amount)); setDue(st.item.dueDay ? String(st.item.dueDay) : '')
    setPayDate(defaultPayDate(m, st.item.dueDay)); setErr('')
  }, [itemId, m]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return null
  const it = st.item

  async function savePlan() {
    const c = parseAmount(amount)
    const d = due.trim() === '' ? null : Number(due)
    if (c == null) { setErr('Ongeldig bedrag.'); return }
    if (d != null && (!Number.isInteger(d) || d < 1 || d > 31)) { setErr('Vul een dag tussen 1 en 31 in, of laat het leeg als je het niet weet.'); return }
    const ok = await commit((state) => {
      let next = updateMonthItem(state, m, it.id, { amount: c, dueDay: d })
      if (allMonths) {
        const settings = { ...next.settings, items: next.settings.items.map((p) => (p.id === it.id ? { ...p, amount: c, dueDay: d } : p)) }
        next = updateSettings(next, settings, { applyFrom: m })
      }
      return next
    }, { success: allMonths ? `${it.name} bijgewerkt vanaf ${monthLabel(m)}` : `${it.name} bijgewerkt voor ${monthLabel(m)}` })
    if (ok) onClose()
  }

  async function payWith() {
    const c = parseAmount(payAmount)
    if (!c || c <= 0) { setErr('Vul het betaalde bedrag in.'); return }
    if (!payDate) { setErr('Kies een datum.'); return }
    const ok = await commit((state) => toggleItem(state, m, it.id, { date: payDate, amount: c }).data, { success: `${it.name} afgevinkt`, undoable: true })
    if (ok) onClose()
  }

  return (
    <Sheet open onClose={onClose} title={it.name}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 text-[14px] text-muted">
          {monthLabel(m)} · {st.done ? <Pill tone="success">{it.kind === 'budget' ? 'afgesloten' : 'afgevinkt'}</Pill> : <Pill tone="muted">open</Pill>}
        </div>

        {it.kind !== 'budget' && st.tx && (
          <div className="panel flex items-center justify-between p-4">
            <div><div className="text-[15px]">{TX_LABEL[st.tx.type]}</div><div className="text-[13px] text-muted">op {formatDate(st.tx.date, { year: true })}</div></div>
            <div className="flex items-center gap-3"><Money c={st.tx.amount} className="text-[17px] font-semibold" /><Button variant="secondary" className="!min-h-[38px] !px-3 text-[14px]" onClick={() => setEditTx(st.tx!)}>Wijzig</Button></div>
          </div>
        )}

        {it.kind !== 'budget' && !st.tx && (
          <Section title="Afvinken met werkelijk bedrag">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bedrag"><input className={inputCls + ' num'} inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></Field>
              <Field label="Datum"><input type="date" className={inputCls} value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
            </div>
            <Button onClick={() => void payWith()}>Afvinken</Button>
          </Section>
        )}

        <Section title="Plan">
          <div className="grid grid-cols-2 gap-3">
            <Field label={it.kind === 'budget' ? 'Budget' : 'Gepland bedrag'}><input className={inputCls + ' num'} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Dag van de maand" hint="Leeg = onbekend"><input className={inputCls + ' num'} inputMode="numeric" placeholder="bijv. 25" value={due} onChange={(e) => setDue(e.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>
          </div>
          <label className="flex items-center gap-3 px-1 text-[14px]">
            <input type="checkbox" className="h-5 w-5 accent-[color:var(--accent)]" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} />
            Ook voor alle volgende maanden
          </label>
          {err && <p className="text-[14px] text-danger">{err}</p>}
          <Button variant="secondary" onClick={() => void savePlan()}>Plan opslaan</Button>
        </Section>
      </div>
      <TxEditor open={!!editTx} tx={editTx} onClose={() => { setEditTx(null); onClose() }} />
    </Sheet>
  )
}

/* ---------------- Kalender ---------------- */

interface CalEvent { day: number; label: string; amount?: number; state: 'gepland' | 'voldaan' | 'review'; kind: string }

function Calendar({ m }: { m: string }) {
  const { data } = useStore()
  const s = useMemo(() => monthSummary(data, m), [data, m])
  const [sel, setSel] = useState<number | null>(m === currentMonth() ? new Date().getDate() : null)
  const [detail, setDetail] = useState<string | null>(null)
  useEffect(() => { setSel(m === currentMonth() ? new Date().getDate() : null) }, [m])

  const events: CalEvent[] = []
  for (const st of s.items) {
    if (st.item.kind === 'budget') continue
    if (st.tx) events.push({ day: Number(st.tx.date.slice(8)), label: st.item.name, amount: st.tx.amount, state: 'voldaan', kind: st.item.kind })
    else if (st.item.dueDay) events.push({ day: Math.min(st.item.dueDay, daysInMonth(m)), label: st.item.kind === 'income' ? 'Salaris verwacht' : st.item.name, amount: st.item.amount, state: 'gepland', kind: st.item.kind })
  }
  for (const t of data.transactions) {
    if (t.deletedAt || t.month !== m || !t.date.startsWith(m)) continue
    if (t.itemId && s.items.some((i) => i.item.id === t.itemId && i.item.kind !== 'budget')) continue
    events.push({ day: Number(t.date.slice(8)), label: t.note || t.category, amount: t.amount, state: 'voldaan', kind: t.type })
  }
  for (const r of data.settings.reminders) {
    if (!r.enabled) continue
    if (r.kind === 'monthly' && r.day) events.push({ day: Math.min(r.day, daysInMonth(m)), label: 'Maandreview', state: 'review', kind: 'review' })
    if (r.kind === 'weekly' && r.weekday != null) {
      for (let d = 1; d <= daysInMonth(m); d++) if (new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, d).getDay() === r.weekday) events.push({ day: d, label: 'Weekcheck budget', state: 'review', kind: 'review' })
    }
  }
  const noDate = s.items.filter((st) => st.item.kind !== 'budget' && !st.tx && !st.item.dueDay)
  const firstDow = (new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).getDay() + 6) % 7 // maandag eerst
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth(m) }, (_, i) => i + 1)]
  const isToday = (d: number) => m === currentMonth() && d === new Date().getDate()
  const dayEvents = sel ? events.filter((e) => e.day === sel) : []

  return (
    <div className="flex flex-col gap-5">
      <div className="panel p-3">
        <div className="grid grid-cols-7 pb-1 text-center text-[11px] text-muted">
          {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (d == null) return <div key={'e' + i} />
            const ev = events.filter((e) => e.day === d)
            return (
              <button key={d} type="button" onClick={() => setSel(d)} className={'flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[15px] num ' + (sel === d ? 'bg-accent text-accent-ink' : isToday(d) ? 'bg-sunken font-semibold' : '')}>
                {d}
                <span className="flex h-1.5 gap-0.5">
                  {ev.slice(0, 3).map((e, j) => <span key={j} className="h-1.5 w-1.5 rounded-full" style={{ background: e.state === 'voldaan' ? 'var(--success)' : e.state === 'review' ? 'var(--muted)' : 'var(--warning)' }} />)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex justify-center gap-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warning" />gepland</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" />voldaan</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--muted)' }} />review</span>
        </div>
      </div>

      {sel && (
        <Section title={`${WEEKDAYS[new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, sel).getDay()]} ${formatDate(`${m}-${pad(sel)}`)}`}>
          {dayEvents.length === 0 ? <div className="panel p-4 text-[14px] text-muted">Niets gepland op deze dag.</div> : (
            <List>
              {dayEvents.map((e, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: e.state === 'voldaan' ? 'var(--success)' : e.state === 'review' ? 'var(--muted)' : 'var(--warning)' }} />
                  <div className="min-w-0 flex-1"><div className="truncate text-[15px]">{e.label}</div><div className="text-[12.5px] text-muted">{e.state}</div></div>
                  {e.amount != null && <Money c={e.amount} className="text-[15px]" />}
                </div>
              ))}
            </List>
          )}
        </Section>
      )}

      {noDate.length > 0 && (
        <Section title="Zonder vaste datum">
          <List>
            {noDate.map((st) => (
              <button key={st.item.id} type="button" onClick={() => setDetail(st.item.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken">
                <div className="min-w-0 flex-1"><div className="truncate text-[15px]">{st.item.name}</div><div className="text-[12.5px] text-muted">Tik om de dag in te stellen</div></div>
                <Money c={st.item.amount} className="text-[15px]" />
              </button>
            ))}
          </List>
          <p className="px-1 text-[13px] text-muted">Ik verzin geen vervaldatums. Stel de dag in zodra je hem weet; dan verschijnt de post in de kalender en in je herinneringen.</p>
        </Section>
      )}
      <ItemSheet m={m} itemId={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
