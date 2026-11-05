import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { reserveStats, savingsStats } from '../lib/calc'
import { formatDate, monthLabel, monthShort } from '../lib/dates'
import { centsToInput, euro, parseAmount } from '../lib/money'
import { updateSettings } from '../lib/actions'
import { Bar, Button, List, PageHeader, Section, Segmented, inputCls } from '../components/ui'
import { TxEditor, type TxPreset } from '../components/TxEditor'
import { Area, Columns } from '../components/Charts'
import type { Transaction } from '../lib/types'

export function SavingsPage() {
  const [view, setView] = useState<'sparen' | 'auto'>('sparen')
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Sparen" title={view === 'sparen' ? 'Spaardoel' : 'Autoreserve'} />
      <Segmented value={view} onChange={setView} options={[{ value: 'sparen', label: 'Spaardoel' }, { value: 'auto', label: 'Autoreserve' }]} />
      {view === 'sparen' ? <Goal /> : <Reserve />}
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5"><span className="text-[12.5px] text-muted">{label}</span><span className="num text-[17px] font-medium">{children}</span></div>
}

function Goal() {
  const { data } = useStore()
  const sv = useMemo(() => savingsStats(data), [data])
  const [preset, setPreset] = useState<TxPreset | null>(null)
  const [edit, setEdit] = useState<Transaction | null>(null)
  const history = data.transactions.filter((t) => !t.deletedAt && t.type.startsWith('savings')).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
  const monthlyTarget = data.settings.items.find((i) => i.kind === 'savings')?.amount ?? 0
  const perf = sv.perMonth.filter((p) => p.month >= data.settings.startMonth && p.month <= data.settings.goal.targetDate.slice(0, 7))
  const stretchPos = sv.stretch > 0 ? (sv.target / sv.stretch) * 100 : 0
  const onTrack = sv.projection != null && sv.projection >= sv.target

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-4 px-1">
        <div>
          <div className="label">Spaarsaldo</div>
          <div className="num mt-1 text-[44px] font-semibold leading-none tracking-[-0.035em]">{euro(sv.balance)}</div>
          <div className="mt-2 text-[14px] text-muted"><span className="num font-medium text-success">{sv.percent.toFixed(1).replace('.', ',')}%</span> van {euro(sv.target, { whole: true })} · nog <span className="num text-ink">{euro(sv.remaining)}</span></div>
        </div>
        <div className="relative pt-1">
          <Bar value={sv.balance} max={sv.stretch} tone="success" className="!h-2.5" />
          <div className="absolute top-0 h-[18px] w-px bg-[color:var(--ink)]" style={{ left: stretchPos + '%' }} />
          <div className="mt-2 flex justify-between text-[12px] text-muted">
            <span>€0</span>
            <span style={{ marginLeft: stretchPos - 50 + '%' }}>Doel {euro(sv.target, { whole: true })}</span>
            <span>Stretch {euro(sv.stretch, { whole: true })}</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setPreset({ type: 'savings_deposit', note: 'Spaarstorting' })}>+ Storting</Button>
        <Button variant="secondary" onClick={() => setPreset({ type: 'savings_withdrawal', note: 'Opname' })}>− Opname</Button>
      </div>

      <div className="panel grid grid-cols-2 gap-x-4 gap-y-4 p-4">
        <Stat label="Totaal gestort">{euro(sv.totalDeposited)}</Stat>
        <Stat label="Totaal opgenomen">{euro(sv.totalWithdrawn)}</Stat>
        <Stat label={`Netto in ${new Date().getFullYear()}`}>{euro(sv.yearSaved)}</Stat>
        <Stat label="Beginsaldo">{euro(sv.opening)}</Stat>
        <Stat label="Nog nodig per maand">{euro(sv.requiredMonthly)}</Stat>
        <Stat label="Maanden te gaan">{sv.monthsToGo}</Stat>
        <div className="col-span-2 border-t hair pt-4">
          <div className="text-[12.5px] text-muted">Verwacht saldo op {formatDate(data.settings.goal.targetDate, { year: true })}</div>
          {sv.projection == null ? (
            <div className="mt-1 text-[15px] text-muted">Nog geen voorspelling: leg eerst een echte spaarstorting vast.</div>
          ) : (
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className={'num text-[24px] font-semibold ' + (onTrack ? 'text-success' : 'text-warning')}>{euro(sv.projection)}</span>
              <span className="text-right text-[12.5px] text-muted">gem. {euro(sv.averageMonthly ?? 0)} p/m<br />over {sv.basedOnMonths} {sv.basedOnMonths === 1 ? 'maand' : 'maanden'}</span>
            </div>
          )}
        </div>
      </div>

      <Section title="Mijlpalen">
        <div className="grid grid-cols-5 gap-1.5">
          {sv.milestones.map((ms) => (
            <div key={ms.amount} title={ms.reachedOn ? `Bereikt op ${formatDate(ms.reachedOn, { year: true })}` : 'Nog niet bereikt'}
              className={'flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center ' + (ms.reached ? 'bg-success-soft text-success' : 'bg-sunken text-muted')}>
              <span className="num text-[13px] font-semibold">{ms.amount >= 100000 ? `${(ms.amount / 100000).toLocaleString('nl-NL')}k` : `€${ms.amount / 100}`}</span>
              <span className="text-[10.5px]">{ms.reached ? (ms.reachedOn ? formatDate(ms.reachedOn) : 'gehaald') : 'open'}</span>
            </div>
          ))}
        </div>
      </Section>

      {perf.length > 0 && (
        <Section title="Prestatie per maand">
          <div className="panel p-4">
            <Columns label="Netto gespaard" data={perf.map((p) => ({ key: p.month, label: monthLabel(p.month), value: p.net }))} target={monthlyTarget} tone="success" />
          </div>
          <div className="panel p-4">
            <Area points={perf.map((p) => ({ label: monthLabel(p.month), value: p.balance }))} target={sv.target} />
          </div>
        </Section>
      )}

      <Section title="Geschiedenis">
        {history.length === 0 ? (
          <div className="panel p-4 text-[14px] text-muted">Nog geen stortingen. Vink "Spaaroverboeking" af in je maandoverzicht of voeg hierboven een storting toe. Heb je al spaargeld? Leg dat vast als beginsaldo.
            <div className="mt-3"><Button variant="secondary" onClick={() => setPreset({ type: 'savings_opening', note: 'Beginsaldo' })}>Beginsaldo vastleggen</Button></div>
          </div>
        ) : (
          <List>
            {history.map((t) => (
              <button key={t.id} type="button" onClick={() => setEdit(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken">
                <div className="min-w-0 flex-1"><div className="truncate text-[15px]">{t.type === 'savings_withdrawal' ? 'Opname' : t.type === 'savings_opening' ? 'Beginsaldo' : 'Storting'}{t.note && !['Spaaroverboeking', 'Opname', 'Beginsaldo', 'Spaarstorting'].includes(t.note) ? ` · ${t.note}` : ''}</div><div className="text-[12.5px] text-muted">{formatDate(t.date, { year: true })} · {monthShort(t.month)}</div></div>
                <span className={'num text-[15px] ' + (t.type === 'savings_withdrawal' ? 'text-warning' : 'text-success')}>{t.type === 'savings_withdrawal' ? '−' : '+'}{euro(t.amount)}</span>
              </button>
            ))}
          </List>
        )}
      </Section>
      <TxEditor open={!!preset} preset={preset ?? undefined} onClose={() => setPreset(null)} />
      <TxEditor open={!!edit} tx={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function Reserve() {
  const { data, commit } = useStore()
  const rs = useMemo(() => reserveStats(data), [data])
  const [preset, setPreset] = useState<TxPreset | null>(null)
  const [edit, setEdit] = useState<Transaction | null>(null)
  const [target, setTarget] = useState(centsToInput(rs.monthlyTarget))
  const all = [...rs.expenses, ...rs.deposits, ...data.transactions.filter((t) => !t.deletedAt && t.type === 'reserve_opening')].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))

  async function saveTarget() {
    const c = parseAmount(target)
    if (c == null) return
    await commit((d) => updateSettings(d, { ...d.settings, items: d.settings.items.map((i) => (i.kind === 'reserve' ? { ...i, amount: c } : i)) }, { applyFrom: new Date().toISOString().slice(0, 7) }), { success: `Maandbedrag autoreserve is nu ${euro(c)}` })
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-1 px-1">
        <div className="label">Saldo autoreserve</div>
        <div className={'num text-[44px] font-semibold leading-none tracking-[-0.035em] ' + (rs.balance < 0 ? 'text-warning' : '')}>{euro(rs.balance)}</div>
        <div className="mt-1.5 text-[14px] text-muted">Apart van je spaardoel. Onderhoud dat je hieruit betaalt, telt niet mee in je vrije budget.</div>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setPreset({ type: 'reserve_deposit', note: 'Storting autoreserve' })}>+ Geld toevoegen</Button>
        <Button variant="secondary" onClick={() => setPreset({ type: 'reserve_expense', note: '', category: 'Auto-onderhoud' })}>Onderhoud</Button>
      </div>
      <div className="panel grid grid-cols-3 gap-3 p-4">
        <Stat label="Ingelegd">{euro(rs.deposited + rs.opening)}</Stat>
        <Stat label="Uitgegeven">{euro(rs.spent)}</Stat>
        <Stat label="Per maand">{euro(rs.monthlyTarget)}</Stat>
      </div>
      <Section title="Maandelijkse inleg aanpassen">
        <div className="flex gap-2">
          <div className="relative flex-1"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">€</span><input id="reserve-target" className={inputCls + ' pl-8 num'} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          <Button variant="secondary" onClick={() => void saveTarget()}>Opslaan</Button>
        </div>
        <p className="px-1 text-[12.5px] text-muted">Geldt vanaf deze maand. Je vrije budget wordt automatisch opnieuw berekend.</p>
      </Section>
      <Section title="Geschiedenis">
        {all.length === 0 ? <div className="panel p-4 text-[14px] text-muted">Nog geen stortingen of onderhoud vastgelegd.<div className="mt-3"><Button variant="secondary" onClick={() => setPreset({ type: 'reserve_opening', note: 'Beginsaldo autoreserve' })}>Beginsaldo vastleggen</Button></div></div> : (
          <List>
            {all.map((t) => (
              <button key={t.id} type="button" onClick={() => setEdit(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken">
                <div className="min-w-0 flex-1"><div className="truncate text-[15px]">{t.type === 'reserve_expense' ? (t.note || 'Onderhoud') : t.type === 'reserve_opening' ? 'Beginsaldo' : 'Storting'}</div><div className="text-[12.5px] text-muted">{formatDate(t.date, { year: true })}</div></div>
                <span className={'num text-[15px] ' + (t.type === 'reserve_expense' ? 'text-warning' : 'text-success')}>{t.type === 'reserve_expense' ? '−' : '+'}{euro(t.amount)}</span>
              </button>
            ))}
          </List>
        )}
      </Section>
      <TxEditor open={!!preset} preset={preset ?? undefined} onClose={() => setPreset(null)} />
      <TxEditor open={!!edit} tx={edit} onClose={() => setEdit(null)} />
    </div>
  )
}
