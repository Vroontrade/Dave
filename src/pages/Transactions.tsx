import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { monthSummary, liveTx } from '../lib/calc'
import { addMonths, currentMonth, formatDate, monthLabel, monthRange } from '../lib/dates'
import { euro } from '../lib/money'
import { purgeTransaction, restoreTransaction, TX_LABEL } from '../lib/actions'
import { Button, List, Money, PageHeader, Section, Segmented, inputCls } from '../components/ui'
import { TxEditor } from '../components/TxEditor'
import { Columns, HBars } from '../components/Charts'
import type { Transaction } from '../lib/types'

type Filter = 'alles' | 'uitgaven' | 'inkomen' | 'sparen' | 'auto' | 'prullenbak'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'alles', label: 'Alles' }, { value: 'uitgaven', label: 'Uitgaven' }, { value: 'inkomen', label: 'Inkomen' },
  { value: 'sparen', label: 'Sparen' }, { value: 'auto', label: 'Autoreserve' }, { value: 'prullenbak', label: 'Prullenbak' },
]
const NEG = ['expense', 'savings_withdrawal', 'reserve_expense']

export function TransactionsPage() {
  const [view, setView] = useState<'lijst' | 'analyse'>('lijst')
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Transacties" title={view === 'lijst' ? 'Alle boekingen' : 'Analyse'} />
      <Segmented value={view} onChange={setView} options={[{ value: 'lijst', label: 'Lijst' }, { value: 'analyse', label: 'Analyse' }]} />
      {view === 'lijst' ? <TxList /> : <Analytics />}
    </div>
  )
}

function TxList() {
  const { data, commit } = useStore()
  const [filter, setFilter] = useState<Filter>('alles')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Transaction | null>(null)
  const [adding, setAdding] = useState(false)

  const list = useMemo(() => {
    const trash = filter === 'prullenbak'
    return data.transactions
      .filter((t) => (trash ? !!t.deletedAt : !t.deletedAt))
      .filter((t) => {
        if (filter === 'uitgaven') return t.type === 'expense'
        if (filter === 'inkomen') return t.type === 'income'
        if (filter === 'sparen') return t.type.startsWith('savings')
        if (filter === 'auto') return t.type.startsWith('reserve')
        return true
      })
      .filter((t) => !q || `${t.note} ${t.category} ${TX_LABEL[t.type]}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  }, [data.transactions, filter, q])

  const groups = useMemo(() => {
    const g: { month: string; items: Transaction[] }[] = []
    for (const t of list) { const last = g[g.length - 1]; if (last && last.month === t.month) last.items.push(t); else g.push({ month: t.month, items: [t] }) }
    return g
  }, [list])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <input id="tx-search" className={inputCls + ' flex-1'} placeholder="Zoeken" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={() => setAdding(true)}>+ Nieuw</Button>
      </div>
      <div className="scroll-x -mx-4 flex gap-1.5 px-4">
        {FILTERS.map((f) => <button key={f.value} type="button" onClick={() => setFilter(f.value)} className={'shrink-0 rounded-full px-3.5 py-2 text-[14px] ' + (filter === f.value ? 'bg-accent text-accent-ink' : 'bg-surface text-muted shadow-sm')}>{f.label}</button>)}
      </div>
      {groups.length === 0 && <div className="panel p-5 text-[15px] text-muted">{filter === 'prullenbak' ? 'De prullenbak is leeg.' : 'Nog geen transacties. Vink posten af in je maandoverzicht, gebruik de assistent, of tik op Nieuw.'}</div>}
      {groups.map((g) => (
        <Section key={g.month} title={monthLabel(g.month)}>
          <List>
            {g.items.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => !t.deletedAt && setEdit(t)} disabled={!!t.deletedAt}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{t.note || t.category}</div>
                    <div className="truncate text-[12.5px] text-muted">{formatDate(t.date, { weekday: true })} · {TX_LABEL[t.type]}{t.type === 'expense' && t.category && t.category !== t.note ? ` · ${t.category}` : ''}{t.history?.length ? ' · gecorrigeerd' : ''}</div>
                  </div>
                  <span className={'num shrink-0 text-[15px] ' + (t.deletedAt ? 'text-muted line-through' : NEG.includes(t.type) ? '' : 'text-success')}>{NEG.includes(t.type) ? '−' : '+'}{euro(t.amount)}</span>
                </button>
                {t.deletedAt && (
                  <div className="flex gap-1">
                    <button type="button" className="rounded-full bg-sunken px-3 py-1.5 text-[13px]" onClick={() => void commit((d) => restoreTransaction(d, t.id), { success: 'Hersteld' })}>Herstel</button>
                    <button type="button" className="rounded-full px-2 py-1.5 text-[13px] text-danger" onClick={() => void commit((d) => purgeTransaction(d, t.id), { success: 'Definitief verwijderd' })}>Wis</button>
                  </div>
                )}
              </div>
            ))}
          </List>
        </Section>
      ))}
      <TxEditor open={!!edit} tx={edit} onClose={() => setEdit(null)} />
      <TxEditor open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function Analytics() {
  const { data } = useStore()
  const [mode, setMode] = useState<'maand' | 'jaar'>('maand')
  const [m, setM] = useState(currentMonth())
  const [year, setYear] = useState(currentMonth() < '2027-01' ? '2027' : currentMonth().slice(0, 4))
  const years = useMemo(() => {
    const ys = new Set<string>([currentMonth().slice(0, 4), '2027'])
    liveTx(data).forEach((t) => ys.add(t.month.slice(0, 4)))
    return [...ys].sort()
  }, [data])

  const s = useMemo(() => monthSummary(data, m), [data, m])
  const cats = (months: string[]) => {
    const map = new Map<string, number>()
    for (const t of liveTx(data)) if (t.type === 'expense' && months.includes(t.month)) map.set(t.category || 'Overig', (map.get(t.category || 'Overig') ?? 0) + t.amount)
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }
  const yearMonths = monthRange(`${year}-01`, `${year}-12`)
  const ys = yearMonths.map((x) => monthSummary(data, x))
  const yIncome = ys.reduce((a, x) => a + x.actualIncome, 0)
  const yExp = ys.reduce((a, x) => a + x.totalExpenses, 0)
  const ySav = ys.reduce((a, x) => a + x.savingsNet, 0)
  const rate = (inc: number, sav: number) => (inc > 0 ? `${((sav / inc) * 100).toFixed(0)}%` : '–')

  return (
    <div className="flex flex-col gap-6">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'maand', label: 'Maand' }, { value: 'jaar', label: 'Jaar' }]} />
      {mode === 'maand' ? (
        <>
          <div className="flex items-center justify-between">
            <button type="button" className="rounded-full bg-surface px-4 py-2 shadow-sm" aria-label="Vorige maand" onClick={() => setM(addMonths(m, -1))}>‹</button>
            <span className="text-[16px] font-medium">{monthLabel(m)}</span>
            <button type="button" className="rounded-full bg-surface px-4 py-2 shadow-sm" aria-label="Volgende maand" onClick={() => setM(addMonths(m, 1))}>›</button>
          </div>
          <div className="panel grid grid-cols-2 gap-4 p-4">
            <div><div className="text-[12.5px] text-muted">Inkomen</div><Money c={s.actualIncome} className="text-[20px] font-semibold" /><div className="text-[12px] text-muted">plan {euro(s.planned.income)}</div></div>
            <div><div className="text-[12.5px] text-muted">Uitgaven</div><Money c={s.totalExpenses} className="text-[20px] font-semibold" /><div className="text-[12px] text-muted">plan {euro(s.planned.fixed)} vast</div></div>
            <div><div className="text-[12.5px] text-muted">Gespaard (netto)</div><Money c={s.savingsNet} className="text-[20px] font-semibold text-success" /></div>
            <div><div className="text-[12.5px] text-muted">Spaarquote</div><span className="num text-[20px] font-semibold">{rate(s.actualIncome, s.savingsNet)}</span><div className="text-[12px] text-muted">van werkelijk inkomen</div></div>
            <div><div className="text-[12.5px] text-muted">Naar autoreserve</div><Money c={s.reserveIn} className="text-[17px]" /></div>
            <div><div className="text-[12.5px] text-muted">Onderhoud uit reserve</div><Money c={s.reserveSpent} className="text-[17px]" /></div>
          </div>
          <Section title="Uitgaven per categorie"><div className="panel p-4"><HBars data={cats([m])} /></div></Section>
        </>
      ) : (
        <>
          <div className="scroll-x flex gap-1.5">
            {years.map((y) => <button key={y} type="button" onClick={() => setYear(y)} className={'rounded-full px-4 py-2 text-[14px] ' + (y === year ? 'bg-accent text-accent-ink' : 'bg-surface text-muted shadow-sm')}>{y}</button>)}
          </div>
          <div className="panel grid grid-cols-2 gap-4 p-4">
            <div><div className="text-[12.5px] text-muted">Inkomen {year}</div><Money c={yIncome} className="text-[20px] font-semibold" /></div>
            <div><div className="text-[12.5px] text-muted">Uitgaven {year}</div><Money c={yExp} className="text-[20px] font-semibold" /></div>
            <div><div className="text-[12.5px] text-muted">Gespaard {year}</div><Money c={ySav} className="text-[20px] font-semibold text-success" /></div>
            <div><div className="text-[12.5px] text-muted">Spaarquote</div><span className="num text-[20px] font-semibold">{rate(yIncome, ySav)}</span></div>
          </div>
          <Section title="Per maand">
            <div className="panel flex flex-col gap-6 p-4">
              <Columns label="Inkomen" data={ys.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.actualIncome }))} />
              <Columns label="Uitgaven" data={ys.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.totalExpenses }))} />
              <Columns label="Netto gespaard" tone="success" target={data.settings.items.find((i) => i.kind === 'savings')?.amount} data={ys.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.savingsNet }))} />
            </div>
          </Section>
          <Section title="Uitgaven per categorie"><div className="panel p-4"><HBars data={cats(yearMonths)} /></div></Section>
          <Section title="Tabel">
            <div className="panel overflow-x-auto">
              <table className="w-full text-[13px] num">
                <thead><tr className="text-left text-muted"><th className="px-3 py-2 font-normal">Maand</th><th className="px-2 py-2 text-right font-normal">Inkomen</th><th className="px-2 py-2 text-right font-normal">Uitgaven</th><th className="px-3 py-2 text-right font-normal">Gespaard</th></tr></thead>
                <tbody>
                  {ys.map((x) => <tr key={x.month} className="border-t hair"><td className="px-3 py-2">{monthLabel(x.month, false)}</td><td className="px-2 py-2 text-right">{euro(x.actualIncome)}</td><td className="px-2 py-2 text-right">{euro(x.totalExpenses)}</td><td className="px-3 py-2 text-right">{euro(x.savingsNet)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
