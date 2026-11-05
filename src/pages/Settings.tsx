import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { ItemKind, PlanItem, Reminder, Settings } from '../lib/types'
import { centsToInput, euro, parseAmount } from '../lib/money'
import { planTotals } from '../lib/calc'
import { newPlanItem, updateSettings } from '../lib/actions'
import { suggestAliases } from '../lib/defaults'
import { currentMonth, isValidISODate, monthLabel, WEEKDAYS } from '../lib/dates'
import { exportJSON, importJSON, listLocalBackups } from '../lib/storage'
import { offerFile, reminderDay, remindersICS, transactionsCSV } from '../lib/exporters'
import { Button, Field, List, PageHeader, Section, inputCls } from '../components/ui'

const KIND_NAMES: Record<ItemKind, string> = { income: 'Inkomen', bill: 'Vaste last', budget: 'Budget', savings: 'Sparen', reserve: 'Autoreserve' }

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Instellingen" title="Plan en gegevens" />
      <PlanEditor />
      <GoalEditor />
      <Reminders />
      <DataSection />
      <Install />
    </div>
  )
}

interface Draft { id: string; name: string; kind: ItemKind; amount: string; dueDay: string; active: boolean; isNew?: boolean; aliases: string[] }
const toDraft = (p: PlanItem): Draft => ({ id: p.id, name: p.name, kind: p.kind, amount: centsToInput(p.amount), dueDay: p.dueDay ? String(p.dueDay) : '', active: p.active, aliases: p.aliases })

function PlanEditor() {
  const { data, commit } = useStore()
  const [drafts, setDrafts] = useState<Draft[]>(() => data.settings.items.map(toDraft))
  const [applyNow, setApplyNow] = useState(true)
  const [err, setErr] = useState('')
  useEffect(() => { setDrafts(data.settings.items.map(toDraft)) }, [data.settings.items])

  const parsed = drafts.map((d) => ({ ...d, cents: parseAmount(d.amount) }))
  const totals = planTotals(parsed.filter((d) => d.active && d.cents != null).map((d) => ({ kind: d.kind, amount: d.cents! })))
  const dirty = JSON.stringify(drafts) !== JSON.stringify(data.settings.items.map(toDraft))
  const set = (id: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  async function save() {
    const bad = parsed.find((d) => d.cents == null || !d.name.trim() || (d.dueDay !== '' && (Number(d.dueDay) < 1 || Number(d.dueDay) > 31)))
    if (bad) { setErr(`Controleer "${bad.name || 'nieuwe post'}": vul een naam, een geldig bedrag en eventueel een dag tussen 1 en 31 in.`); return }
    setErr('')
    const items: PlanItem[] = parsed.map((d) => ({ id: d.id, name: d.name.trim(), kind: d.kind, amount: d.cents!, dueDay: d.dueDay ? Number(d.dueDay) : null, active: d.active, aliases: d.isNew || !d.aliases.length ? suggestAliases(d.name) : d.aliases }))
    await commit((s) => updateSettings(s, { ...s.settings, items }, applyNow ? { applyFrom: currentMonth() } : {}), { success: 'Plan opgeslagen' })
  }

  const order: ItemKind[] = ['income', 'bill', 'budget', 'savings', 'reserve']
  return (
    <Section title="Inkomen en vaste lasten">
      <List>
        {order.flatMap((k) => drafts.filter((d) => d.kind === k)).map((d) => (
          <div key={d.id} className={'flex flex-col gap-2 px-4 py-3 ' + (d.active ? '' : 'opacity-50')}>
            <div className="flex items-center gap-2">
              <input aria-label="Naam" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" value={d.name} onChange={(e) => set(d.id, { name: e.target.value })} />
              <span className="text-[12px] text-muted">{KIND_NAMES[d.kind]}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted">€</span>
                <input aria-label={`Bedrag ${d.name}`} className={inputCls + ' !py-2 pl-7 num text-[15px]'} inputMode="decimal" value={d.amount} onChange={(e) => set(d.id, { amount: e.target.value })} /></div>
              <input aria-label={`Dag van de maand ${d.name}`} className={inputCls + ' !w-[86px] !py-2 num text-[15px]'} inputMode="numeric" placeholder="dag ?" value={d.dueDay} onChange={(e) => set(d.id, { dueDay: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
              {['income', 'savings', 'reserve'].includes(d.kind) ? null : d.isNew
                ? <button type="button" className="px-2 text-[13px] text-danger" onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}>Weg</button>
                : <button type="button" className="w-[52px] text-[13px] text-muted" onClick={() => set(d.id, { active: !d.active })}>{d.active ? 'Uit' : 'Aan'}</button>}
            </div>
          </div>
        ))}
      </List>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1 text-[14px]" onClick={() => setDrafts((ds) => [...ds, { ...toDraft(newPlanItem('bill', '', 0)), name: 'Nieuwe vaste last', amount: '', isNew: true }])}>+ Vaste last</Button>
        <Button variant="secondary" className="flex-1 text-[14px]" onClick={() => setDrafts((ds) => [...ds, { ...toDraft(newPlanItem('budget', '', 0)), name: 'Nieuw budget', amount: '', isNew: true }])}>+ Budget</Button>
      </div>
      <div className="panel flex flex-col gap-1.5 p-4 text-[14px]">
        {[['Inkomen', totals.income], ['Vaste lasten', totals.fixed], ['Sparen', totals.savings], ['Autoreserve', totals.reserve]].map(([l, v]) => <div key={l as string} className="flex justify-between"><span className="text-muted">{l}</span><span className="num">{euro(v as number)}</span></div>)}
        <div className="mt-1 flex justify-between border-t hair pt-2 font-semibold"><span>Beschikbaar budget</span><span className={'num ' + (totals.available < 0 ? 'text-warning' : '')}>{euro(totals.available)}</span></div>
      </div>
      <label className="flex items-center gap-3 px-1 text-[14px]">
        <input type="checkbox" className="h-5 w-5" checked={applyNow} onChange={(e) => setApplyNow(e.target.checked)} />
        Ook toepassen op {monthLabel(currentMonth())} (eerdere maanden blijven ongewijzigd)
      </label>
      {err && <p className="px-1 text-[14px] text-danger">{err}</p>}
      <Button disabled={!dirty} onClick={() => void save()}>{dirty ? 'Plan opslaan' : 'Geen wijzigingen'}</Button>
      <p className="px-1 text-[12.5px] text-muted">"Dag" is de dag van de maand waarop de post meestal valt. Laat leeg als je het niet weet; dan verschijnt hij als "datum onbekend".</p>
    </Section>
  )
}

function GoalEditor() {
  const { data, commit } = useStore()
  const g = data.settings.goal
  const [target, setTarget] = useState(centsToInput(g.target))
  const [stretch, setStretch] = useState(centsToInput(g.stretch))
  const [date, setDate] = useState(g.targetDate)
  const [err, setErr] = useState('')
  async function save() {
    const t = parseAmount(target), s = parseAmount(stretch)
    if (!t || !s || !isValidISODate(date)) { setErr('Controleer de bedragen en de datum.'); return }
    if (s < t) { setErr('Je stretchdoel moet hoger zijn dan je hoofddoel.'); return }
    setErr('')
    await commit((d) => updateSettings(d, { ...d.settings, goal: { target: t, stretch: s, targetDate: date } }), { success: 'Spaardoel opgeslagen' })
  }
  return (
    <Section title="Spaardoel">
      <div className="panel flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Doel"><input id="goal-target" className={inputCls + ' num'} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          <Field label="Stretchdoel"><input id="goal-stretch" className={inputCls + ' num'} inputMode="decimal" value={stretch} onChange={(e) => setStretch(e.target.value)} /></Field>
        </div>
        <Field label="Streefdatum"><input id="goal-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {err && <p className="text-[14px] text-danger">{err}</p>}
        <Button variant="secondary" onClick={() => void save()}>Spaardoel opslaan</Button>
      </div>
    </Section>
  )
}

function Reminders() {
  const { data, commit, toast } = useStore()
  const [perm, setPerm] = useState<string>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  const update = (id: string, patch: Partial<Reminder>) =>
    void commit((d) => updateSettings(d, { ...d.settings, reminders: d.settings.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
  const inClaude = typeof window !== 'undefined' && !!window.claude

  async function askPermission() {
    if (typeof Notification === 'undefined') { toast('Deze browser ondersteunt geen meldingen. Gebruik de agenda-export.', 'error'); return }
    try { const p = await Notification.requestPermission(); setPerm(p); await commit((d) => updateSettings(d, { ...d.settings, notificationsEnabled: p === 'granted' })) }
    catch { toast('Toestemming vragen lukte niet. Gebruik de agenda-export.', 'error') }
  }
  async function exportIcs() {
    const { ics, count, skipped } = remindersICS(data)
    if (count === 0) { toast('Zet eerst minstens één herinnering aan met een dag.', 'error'); return }
    const r = await offerFile('finance-herinneringen.ics', ics, 'text/calendar')
    if (r === 'failed') toast('Het bestand kon niet worden aangeboden.', 'error')
    else toast(`${count} terugkerende ${count === 1 ? 'afspraak' : 'afspraken'} klaargezet${skipped.length ? `; ${skipped.length} overgeslagen (dag onbekend)` : ''}`)
  }

  return (
    <Section title="Herinneringen">
      <List>
        {data.settings.reminders.map((r) => (
          <div key={r.id} className="flex flex-col gap-2.5 px-4 py-3">
            <label className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-[15px]">{r.label}</span>
              <input type="checkbox" className="h-5 w-5" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} aria-label={`${r.label} aan of uit`} />
            </label>
            {r.enabled && (
              <div className="flex flex-wrap items-center gap-2 text-[14px]">
                {r.kind === 'weekly' ? (
                  <select className={inputCls + ' !w-auto !py-2'} value={r.weekday ?? 0} onChange={(e) => update(r.id, { weekday: Number(e.target.value) })} aria-label="Weekdag">
                    {WEEKDAYS.map((w, i) => <option key={w} value={i}>elke {w}</option>)}
                  </select>
                ) : r.kind === 'bills' ? (
                  <select className={inputCls + ' !w-auto !py-2'} value={r.daysBefore} onChange={(e) => update(r.id, { daysBefore: Number(e.target.value) })} aria-label="Dagen van tevoren">
                    {[0, 1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n === 0 ? 'op de vervaldag' : `${n} ${n === 1 ? 'dag' : 'dagen'} van tevoren`}</option>)}
                  </select>
                ) : (
                  <select className={inputCls + ' !w-auto !py-2'} value={reminderDay(r, data) ?? ''} onChange={(e) => update(r.id, { day: e.target.value ? Number(e.target.value) : null })} aria-label="Dag van de maand">
                    <option value="">dag kiezen</option>
                    {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>elke {i + 1}e</option>)}
                  </select>
                )}
                <input type="time" className={inputCls + ' !w-auto !py-2'} value={r.time} onChange={(e) => e.target.value && update(r.id, { time: e.target.value })} aria-label="Tijd" />
                {r.kind === 'bills' && <span className="w-full text-[12.5px] text-muted">Alleen voor rekeningen waarvan je de dag hebt ingevuld.</span>}
              </div>
            )}
          </div>
        ))}
      </List>
      <div className="panel flex flex-col gap-3 p-4 text-[14px]">
        <div className="font-medium">Zo krijg je ze op je iPhone</div>
        <p className="text-muted"><span className="text-ink">In de app:</span> actieve herinneringen staan bovenaan je dashboard zodra je de app opent. Dat werkt altijd.</p>
        <p className="text-muted"><span className="text-ink">Echte iOS-meldingen:</span> zet herinneringen in je iPhone Agenda. Elke herinnering wordt een terugkerende afspraak met een melding. Werk je data of tijden bij, exporteer dan opnieuw en verwijder de oude agenda-afspraken.</p>
        <Button onClick={() => void exportIcs()}>Zet in iPhone Agenda (.ics)</Button>
        <p className="text-muted"><span className="text-ink">Browsermeldingen:</span> een webapp op de iPhone kan alleen meldingen tonen als hij op je beginscherm staat (iOS 16.4+) en open is. Zonder eigen server kan iOS geen meldingen op een vast tijdstip sturen; daarom is de agenda de betrouwbare route.</p>
        {standalone && !inClaude && perm !== 'granted' && perm !== 'unsupported' && <Button variant="secondary" onClick={() => void askPermission()}>Meldingen toestaan</Button>}
        {perm === 'granted' && <p className="text-success">Meldingen staan aan voor deze app.</p>}
      </div>
    </Section>
  )
}

function DataSection() {
  const { data, mode, replaceAll, toast, commit } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ label: string; data: typeof data } | null>(null)
  const backups = useMemo(() => listLocalBackups(), [data])
  const live = data.transactions.filter((t) => !t.deletedAt).length
  const modeText = mode === 'cloud' ? 'Opgeslagen in je Claude-account (privé), met een kopie op dit apparaat.' : mode === 'local' ? 'Opgeslagen op dit apparaat. Maak regelmatig een back-up.' : 'Opslag is niet beschikbaar in deze weergave. Wijzigingen gaan verloren bij sluiten.'

  async function doExport(kind: 'json' | 'csv') {
    const stamp = new Date().toISOString().slice(0, 10)
    const r = kind === 'json'
      ? await offerFile(`finance-backup-${stamp}.json`, exportJSON(data), 'application/json')
      : await offerFile(`finance-transacties-${stamp}.csv`, transactionsCSV(data), 'text/csv')
    if (r === 'failed') toast('Exporteren lukte niet.', 'error')
  }
  async function onFile(f: File | undefined) {
    if (!f) return
    try { const d = importJSON(await f.text()); setPending({ label: `${f.name} · ${d.transactions.filter((t) => !t.deletedAt).length} transacties`, data: d }) }
    catch (e) { toast((e as Error).message, 'error') }
    if (fileRef.current) fileRef.current.value = ''
  }
  async function restore() {
    if (!pending) return
    const ok = await replaceAll(pending.data)
    toast(ok ? 'Back-up teruggezet' : 'Terugzetten mislukt; je huidige gegevens zijn ongewijzigd.', ok ? 'ok' : 'error')
    setPending(null)
  }

  return (
    <Section title="Gegevens en back-up">
      <div className="panel flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-[14px]"><span className={'h-2 w-2 rounded-full ' + (mode === 'memory' ? 'bg-warning' : 'bg-success')} />{modeText}</div>
        <div className="text-[13px] text-muted"><span className="num">{live}</span> transacties · plan bijgewerkt {new Date(data.settings.updatedAt).toLocaleDateString('nl-NL')}</div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="text-[14px]" onClick={() => void doExport('json')}>Back-up (JSON)</Button>
          <Button variant="secondary" className="text-[14px]" onClick={() => void doExport('csv')}>Export (CSV)</Button>
        </div>
        <Button variant="secondary" className="text-[14px]" onClick={() => fileRef.current?.click()}>Back-up terugzetten…</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        {backups.length > 0 && (
          <details className="text-[14px]">
            <summary className="cursor-pointer text-muted">Automatische back-ups op dit apparaat ({backups.length})</summary>
            <div className="mt-2 flex flex-col gap-1">
              {backups.map((b) => <button key={b.date} type="button" className="flex justify-between rounded-lg px-2 py-2 text-left active:bg-sunken" onClick={() => setPending({ label: `Automatische back-up van ${b.date}`, data: b.data })}><span>{b.date}</span><span className="text-muted">{b.count} transacties</span></button>)}
            </div>
          </details>
        )}
        {pending && (
          <div className="flex flex-col gap-2 rounded-xl bg-warning-soft p-3 text-[14px]">
            <div><span className="font-medium">Terugzetten?</span> {pending.label}. Dit vervangt al je huidige gegevens. Maak eerst een back-up als je twijfelt.</div>
            <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setPending(null)}>Annuleren</Button><Button className="flex-1" onClick={() => void restore()}>Terugzetten</Button></div>
          </div>
        )}
        <Field label="Startmaand van je overzicht">
          <input type="month" className={inputCls} value={data.settings.startMonth} onChange={(e) => e.target.value && void commit((d) => updateSettings(d, { ...d.settings, startMonth: e.target.value } as Settings))} />
        </Field>
      </div>
    </Section>
  )
}

function Install() {
  return (
    <Section title="Op je iPhone zetten">
      <div className="panel flex flex-col gap-2 p-4 text-[14px] text-muted">
        <p><span className="text-ink">Binnen Claude:</span> open deze pagina in de Claude-app of op claude.ai. Je gegevens staan in je account en zijn op elk apparaat hetzelfde.</p>
        <p><span className="text-ink">Als losse app:</span> open de gehoste versie in Safari, tik op het deelicoon en kies "Zet op beginscherm". De app opent dan schermvullend, werkt offline en bewaart je gegevens op je iPhone.</p>
        <p>Finance koppelt niet met je bank en doet nooit echte overboekingen. Het is een overzicht dat jij bijhoudt.</p>
      </div>
    </Section>
  )
}
