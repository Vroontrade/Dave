import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { ItemKind, PlanItem } from '../lib/types'
import { euro, parseAmount } from '../lib/money'
import { planTotals } from '../lib/calc'
import { ensureMonth, uid, updateSettings } from '../lib/actions'
import { item, suggestAliases } from '../lib/defaults'
import { currentMonth, isValidISODate } from '../lib/dates'
import { importJSON } from '../lib/storage'
import { Button, Field, PageHeader, Section, inputCls } from '../components/ui'

interface Row { id: string; name: string; amount: string; kind: Extract<ItemKind, 'bill' | 'budget'> }
const newRow = (kind: Row['kind']): Row => ({ id: uid(), name: '', amount: '', kind })

/** Eenmalig instelscherm: alle persoonlijke bedragen vul je hier zelf in. Er staat niets van in de code. */
export function Setup() {
  const { data, commit, replaceAll, toast } = useStore()
  const [income, setIncome] = useState('')
  const [salaryDay, setSalaryDay] = useState('')
  const [rows, setRows] = useState<Row[]>([newRow('bill'), newRow('bill'), newRow('budget')])
  const [savings, setSavings] = useState('')
  const [reserve, setReserve] = useState('')
  const [target, setTarget] = useState('')
  const [stretch, setStretch] = useState('')
  const [date, setDate] = useState(data.settings.goal.targetDate)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const c = (v: string) => (v.trim() === '' ? 0 : parseAmount(v))
  const filled = rows.filter((r) => r.name.trim() || r.amount.trim())
  const totals = planTotals([
    { kind: 'income', amount: c(income) ?? 0 },
    ...filled.map((r) => ({ kind: r.kind, amount: c(r.amount) ?? 0 })),
    { kind: 'savings', amount: c(savings) ?? 0 },
    { kind: 'reserve', amount: c(reserve) ?? 0 },
  ])
  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  async function save() {
    const inc = c(income), sav = c(savings), res = c(reserve), tgt = c(target), str = c(stretch)
    const day = salaryDay ? Number(salaryDay) : null
    if (!inc) { setErr('Vul je netto maandinkomen in.'); return }
    if (day != null && (day < 1 || day > 31)) { setErr('Kies een salarisdag tussen 1 en 31, of laat hem leeg.'); return }
    if ([sav, res, tgt, str].some((v) => v == null)) { setErr('Controleer de bedragen: gebruik cijfers, bijvoorbeeld 650 of 12,50.'); return }
    const bad = filled.find((r) => !r.name.trim() || c(r.amount) == null || c(r.amount) === 0)
    if (bad) { setErr(`Vul bij "${bad.name || 'een vaste last'}" zowel een naam als een bedrag in, of maak de regel leeg.`); return }
    if (tgt && str && str < tgt) { setErr('Je stretchdoel moet hoger zijn dan je spaardoel.'); return }
    if (!isValidISODate(date)) { setErr('Kies een geldige streefdatum.'); return }
    setErr('')
    const items: PlanItem[] = [
      { ...data.settings.items.find((i) => i.id === 'income') ?? item('income', 'Salaris', 'income', 0, suggestAliases('salaris')), amount: inc, dueDay: day },
      ...filled.map((r) => item(uid(), r.name.trim(), r.kind, c(r.amount)!, suggestAliases(r.name))),
      { ...data.settings.items.find((i) => i.id === 'savings') ?? item('savings', 'Spaaroverboeking', 'savings', 0, ['sparen']), amount: sav ?? 0 },
      { ...data.settings.items.find((i) => i.id === 'reserve') ?? item('reserve', 'Autoreserve', 'reserve', 0, ['autoreserve']), amount: res ?? 0 },
    ]
    await commit((d) => ensureMonth(updateSettings(d, { ...d.settings, items, goal: { target: tgt ?? 0, stretch: str || tgt || 0, targetDate: date }, setupDone: true }, { applyFrom: currentMonth() }), currentMonth()), { success: 'Je plan staat klaar' })
  }

  async function restore(f?: File) {
    if (!f) return
    try {
      const d = importJSON(await f.text())
      const ok = await replaceAll({ ...d, settings: { ...d.settings, setupDone: true } })
      toast(ok ? 'Back-up teruggezet' : 'Terugzetten mislukt', ok ? 'ok' : 'error')
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const money = (id: string, value: string, set: (v: string) => void, placeholder = '0,00') => (
    <div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">€</span>
      <input id={id} className={inputCls + ' pl-8 num'} inputMode="decimal" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} /></div>
  )

  return (
    <div className="flex flex-col gap-7 pb-10">
      <PageHeader eyebrow={__OWNER__ ? `Welkom, ${__OWNER__}` : "Welkom bij Finance"} title="Stel je maandplan in" />
      <p className="px-1 text-[15px] text-muted">Dit doe je één keer. Je bedragen worden alleen op dit apparaat bewaard en kun je later altijd aanpassen in Instellingen.</p>

      <Section title="Inkomen">
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Netto per maand">{money('setup-income', income, setIncome)}</Field>
          <Field label="Salarisdag" hint="Leeg = onbekend"><input id="setup-day" className={inputCls + ' num'} inputMode="numeric" placeholder="bijv. 25" value={salaryDay} onChange={(e) => setSalaryDay(e.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>
        </div>
      </Section>

      <Section title="Vaste lasten en budgetten">
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.id} className="panel flex flex-col gap-2 p-3">
              <div className="flex gap-2">
                <input aria-label="Naam" className={inputCls + ' flex-1 !py-2.5'} placeholder={r.kind === 'budget' ? 'Bijv. Boodschappen' : 'Bijv. Zorgverzekering'} value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} />
                <div className="w-[118px]">{money(`setup-row-${r.id}`, r.amount, (v) => setRow(r.id, { amount: v }))}</div>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <div className="flex rounded-lg bg-sunken p-0.5">
                  {(['bill', 'budget'] as const).map((k) => <button key={k} type="button" onClick={() => setRow(r.id, { kind: k })} className={'rounded-md px-2.5 py-1 ' + (r.kind === k ? 'bg-surface font-medium' : 'text-muted')}>{k === 'bill' ? 'Vaste rekening' : 'Budget'}</button>)}
                </div>
                <button type="button" className="text-muted" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>Verwijder</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 text-[14px]" onClick={() => setRows((rs) => [...rs, newRow('bill')])}>+ Vaste rekening</Button>
          <Button variant="secondary" className="flex-1 text-[14px]" onClick={() => setRows((rs) => [...rs, newRow('budget')])}>+ Budget</Button>
        </div>
        <p className="px-1 text-[12.5px] text-muted">Een vaste rekening vink je elke maand af als betaald. Een budget (bijv. brandstof) is een maximum waarop je je werkelijke uitgaven boekt.</p>
      </Section>

      <Section title="Sparen en reserveren per maand">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Naar spaarrekening">{money('setup-savings', savings, setSavings)}</Field>
          <Field label="Naar autoreserve" hint="0 als je dit niet gebruikt">{money('setup-reserve', reserve, setReserve)}</Field>
        </div>
      </Section>

      <Section title="Spaardoel">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Doel">{money('setup-target', target, setTarget)}</Field>
          <Field label="Stretchdoel" hint="Optioneel">{money('setup-stretch', stretch, setStretch)}</Field>
        </div>
        <Field label="Streefdatum"><input id="setup-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </Section>

      <div className="panel flex flex-col gap-1.5 p-4 text-[14px]">
        {[['Inkomen', totals.income], ['Vaste lasten', totals.fixed], ['Sparen', totals.savings], ['Autoreserve', totals.reserve]].map(([l, v]) => <div key={l as string} className="flex justify-between"><span className="text-muted">{l}</span><span className="num">{euro(v as number)}</span></div>)}
        <div className="mt-1 flex justify-between border-t hair pt-2 font-semibold"><span>Vrij te besteden per maand</span><span className={'num ' + (totals.available < 0 ? 'text-warning' : '')}>{euro(totals.available)}</span></div>
      </div>

      {err && <p className="px-1 text-[14px] text-danger" role="alert">{err}</p>}
      <Button onClick={() => void save()}>Plan opslaan en beginnen</Button>
      <button type="button" className="text-[14px] text-muted underline underline-offset-2" onClick={() => fileRef.current?.click()}>Ik heb een back-up: terugzetten</button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void restore(e.target.files?.[0])} />
    </div>
  )
}
