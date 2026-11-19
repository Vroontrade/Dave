import { useEffect, useMemo, useState } from 'react'
import { Button, Check, Field, List, PageHeader, Pill, Section, Segmented, Sheet, inputCls } from '../components/ui'
import { WEEKDAYS, formatDate, todayISO, daysUntil } from '../lib/dates'
import {
  CATS, HABITS, PILLARS, REVIEW_QUESTIONS, blockPillar, blocksFor, catInfo, currentBlock, dayScore, deleteBlock, habitsDone,
  isFixed, isOverridden, loadPlan, newBlockId, nextInvestDay, nowHHMM, parseISO, pillarProgress, resetDay, saveBlock, savePlan,
  streak, toggleBlock, toggleHabit, trainingsThisWeek, weekDays, weekScore, weekStart, weekTemplate,
  type Block, type Pillar, type PlanData,
} from '../lib/plan'

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const longDate = (iso: string) => { const d = parseISO(iso); return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` }
const greeting = (h: number) => (h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond')
const SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/** Voortgangsring in huisstijl: sunken baan, vulling in success (of accent). */
function Ring({ value, size = 56, stroke = 5, tone = 'success', children }: { value: number; size?: number; stroke?: number; tone?: 'success' | 'accent'; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone === 'success' ? 'var(--success)' : 'var(--accent)'} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} opacity={v > 0 ? 1 : 0} strokeDashoffset={c * (1 - v)} className="ring-fill" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="num text-[20px] font-semibold leading-tight tracking-[-0.01em]">{value}</span>
      {sub && <span className="text-[12px] text-muted">{sub}</span>}
    </div>
  )
}

export function TodayPage() {
  const [plan, setPlan] = useState<PlanData>(loadPlan)
  const [now, setNow] = useState(() => new Date())
  const today = todayISO(now)
  const [date, setDate] = useState(today)
  const [pillar, setPillar] = useState<Pillar | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [weekOpen, setWeekOpen] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saveError, setSaveError] = useState(false)

  useEffect(() => { setSaveError(!savePlan(plan)) }, [plan])
  // Klok bijhouden voor "nu bezig" en wisselen van dag als de app open blijft staan.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    const vis = () => document.visibilityState === 'visible' && setNow(new Date())
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [])
  useEffect(() => { setDate((d) => (d > today ? today : d)) }, [today])

  const isToday = date === today
  const blocks = useMemo(() => blocksFor(plan, date), [plan, date])
  const log = plan.days[date] ?? { h: [], b: [] }
  const done = habitsDone(plan, date)
  const cur = isToday ? currentBlock(blocks, nowHHMM(now)) : null
  const st = streak(plan, today)
  const ws = weekScore(plan, today)
  const tr = trainingsThisWeek(plan, today)
  const week = weekDays(date)
  const isSunday = parseISO(today).getDay() === 0
  const reviewKey = weekStart(today)
  const reviewed = (plan.reviews[reviewKey]?.done.length ?? 0) > 0
  const invest = nextInvestDay(today)
  const investIn = daysUntil(invest, now)

  return (
    <div className="flex flex-col gap-7">
      <PageHeader eyebrow={longDate(today)} title={`${greeting(now.getHours())}, Dave`} right={
        <button type="button" onClick={() => setWeekOpen(true)} className="mb-1 shrink-0 whitespace-nowrap rounded-full bg-surface px-3.5 py-2 text-[14px] shadow-sm active:bg-sunken">Mijn week</button>
      } />
      {saveError && <div className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">Opslaan lukt hier niet. Je vinkjes blijven staan tot je de app sluit.</div>}

      {/* Dagscore en kerncijfers */}
      <section className="panel flex items-center gap-5 p-5 anim-rise" aria-label="Dagscore">
        <Ring value={dayScore(plan, date)} size={96} stroke={7}>
          <div className="text-center leading-none">
            <div className="num text-[26px] font-semibold tracking-[-0.03em]">{done}<span className="text-[15px] font-medium text-muted">/{HABITS.length}</span></div>
            <div className="mt-1 text-[11px] text-muted">{isToday ? 'vandaag' : formatDate(date)}</div>
          </div>
        </Ring>
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Reeks" value={<>{st} <span className="text-[13px] font-normal text-muted">{st === 1 ? 'dag' : 'dagen'}</span></>} />
          <Stat label="Deze week" value={`${Math.round(ws * 100)}%`} />
          <Stat label="Trainingen" value={<>{tr.done}<span className="text-[13px] font-normal text-muted"> / {tr.planned}</span></>} />
          <Stat label="Beleggen" value={investIn === 0 ? 'vandaag' : <>{investIn} <span className="text-[13px] font-normal text-muted">{investIn === 1 ? 'dag' : 'dagen'}</span></>} />
        </div>
      </section>

      {/* Nu bezig / straks */}
      {cur && (
        <div className="flex items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-accent-ink anim-rise">
          <span className={'h-2 w-2 shrink-0 rounded-full ' + (cur.state === 'now' ? 'bg-[color:var(--accent-ink)] animate-pulse' : 'bg-[color:var(--accent-ink)] opacity-50')} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] opacity-70">{cur.state === 'now' ? 'Nu' : 'Straks'}</div>
            <div className="truncate text-[15px] font-medium">{cur.block.title}</div>
          </div>
          <span className="num text-[14px] opacity-80">{cur.block.start}{cur.block.end ? `–${cur.block.end}` : ''}</span>
        </div>
      )}

      {/* Week: balkjes per dag, tik om een dag te bekijken of bij te werken */}
      <Section title="Deze week" action={!isToday ? <button type="button" className="text-[13px] text-muted" onClick={() => setDate(today)}>Terug naar vandaag</button> : undefined}>
        <div className="panel flex items-end justify-between gap-1.5 px-4 pb-3 pt-4">
          {week.map((d) => {
            const s = dayScore(plan, d)
            const future = d > today
            const sel = d === date
            return (
              <button key={d} type="button" disabled={future} onClick={() => setDate(d)} aria-pressed={sel} aria-label={`${longDate(d)}: ${habitsDone(plan, d)} van ${HABITS.length}`}
                className="flex flex-1 flex-col items-center gap-2 disabled:opacity-40">
                <div className="flex h-20 w-full max-w-[28px] items-end overflow-hidden rounded-[8px] bg-sunken">
                  <div className={'w-full rounded-[8px] bar-h ' + (s >= 5 / 7 ? 'bg-success' : 'bg-accent')} style={{ height: `${Math.max(future ? 0 : 4, s * 100)}%`, opacity: future ? 0 : 1 }} />
                </div>
                <span className={'text-[12px] ' + (sel ? 'font-semibold text-ink' : 'text-muted')}>{SHORT[parseISO(d).getDay()]}</span>
                <span className={'h-1 w-1 rounded-full ' + (d === today ? 'bg-ink' : 'bg-transparent')} aria-hidden />
              </button>
            )
          })}
        </div>
      </Section>

      {/* Kerngewoontes */}
      <Section title={isToday ? 'Gewoontes vandaag' : `Gewoontes ${longDate(date)}`} action={<span className="num text-[13px] text-muted">{done} van {HABITS.length}</span>}>
        <List>
          {HABITS.map((h) => {
            const on = log.h.includes(h.id)
            return (
              <button key={h.id} type="button" onClick={() => setPlan((p) => toggleHabit(p, date, h.id))} aria-pressed={on} aria-label={`${on ? 'Ongedaan maken' : 'Afvinken'}: ${h.title}`}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-sunken">
                <Check on={on} />
                <div className="min-w-0 flex-1">
                  <div className={'truncate text-[15px] ' + (on ? 'text-muted line-through decoration-[color:var(--line)]' : '')}>{h.title}</div>
                  <div className="truncate text-[13px] text-muted">{h.hint}</div>
                </div>
                <span className="text-[12px] text-muted">{PILLARS.find((p) => p.id === h.pillar)!.name}</span>
              </button>
            )
          })}
        </List>
      </Section>

      {/* Dagplanning uit de standaardweek */}
      <Section title={isToday ? 'Planning vandaag' : 'Planning'} action={<button type="button" className="text-[13px] text-muted" onClick={() => setWeekOpen(true)}>Mijn week</button>}>
        <List>
          <TimeRow time="06:30" title="Opstaan" muted />
          {blocks.map((bl) => <BlockRow key={bl.id} block={bl} on={log.b.includes(bl.id)} active={cur?.state === 'now' && cur.block.id === bl.id}
            onToggle={() => setPlan((p) => toggleBlock(p, date, bl))} onEdit={() => setEdit({ block: bl, date, isNew: false, scope: 'dag' })} />)}
          <button type="button" onClick={() => setEdit({ block: { id: newBlockId(), start: '19:30', end: '21:00', title: '', cat: 'ion' }, date, isNew: true, scope: 'dag' })}
            className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-muted active:bg-sunken">
            <span className="w-[86px] shrink-0 text-center text-[18px] leading-none" aria-hidden>+</span>Blok toevoegen
          </button>
          <TimeRow time="22:00" title="Schermen weg, afbouwen" muted />
          <TimeRow time="23:00" title="Slapen" muted />
        </List>
        <p className="px-1 text-[13px] text-muted">
          {isOverridden(plan, date)
            ? <>Deze dag wijkt af van je vaste week. <button type="button" className="underline underline-offset-2" onClick={() => setPlan((p) => resetDay(p, date))}>Terug naar vaste week</button></>
            : 'Tik op een blok om het aan te passen, voor deze dag of voor elke week.'}
        </p>
      </Section>

      {/* Weekreview */}
      {(isSunday || reviewed) && (
        <button type="button" onClick={() => setReviewOpen(true)} className="panel flex items-center gap-3 p-4 text-left active:opacity-80">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium">Weekreview</div>
            <div className="text-[13px] text-muted">{reviewed ? `${plan.reviews[reviewKey].done.length} van ${REVIEW_QUESTIONS.length} vragen doorgenomen` : 'Zondag 19:00, 30 minuten terugkijken en vooruit plannen'}</div>
          </div>
          {reviewed ? <Pill tone="success">gedaan</Pill> : <Pill tone="muted">open</Pill>}
        </button>
      )}

      {/* Zes pijlers */}
      <Section title="Pijlers 2027">
        <div className="grid grid-cols-2 gap-2">
          {PILLARS.map((p) => {
            const pr = pillarProgress(plan, p, today)
            return (
              <button key={p.id} type="button" onClick={() => setPillar(p)} className="panel flex flex-col gap-3 p-3.5 text-left active:opacity-80">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-medium">{p.name}</span>
                  <Ring value={pr.value} size={34} stroke={3.5} tone={pr.value >= 1 ? 'success' : 'accent'} />
                </div>
                <div className="line-clamp-2 min-h-[36px] text-[13px] leading-snug text-muted">{plan.goals[p.id] || p.goal}</div>
                <div className="num text-[14px]">{pr.label}</div>
              </button>
            )
          })}
        </div>
        {!isSunday && !reviewed && <button type="button" onClick={() => setReviewOpen(true)} className="self-start px-1 text-[13px] text-muted underline underline-offset-2">Weekreview openen</button>}
      </Section>

      <PillarSheet pillar={pillar} plan={plan} today={today} onClose={() => setPillar(null)} onSave={(fn) => setPlan(fn)} />
      <ReviewSheet open={reviewOpen} plan={plan} weekKey={reviewKey} today={today} onClose={() => setReviewOpen(false)} onSave={(fn) => setPlan(fn)} />
      <WeekSheet open={weekOpen && !edit} plan={plan} date={date} onClose={() => setWeekOpen(false)}
        onEdit={(block, d, isNew) => setEdit({ block, date: d, isNew, scope: 'week' })} onReset={() => setPlan((p) => ({ ...p, week: undefined }))} />
      <BlockSheet edit={edit} onClose={() => setEdit(null)}
        onSave={(b, scope) => { setPlan((p) => saveBlock(p, edit!.date, b, scope)); setEdit(null) }}
        onDelete={(scope) => { setPlan((p) => deleteBlock(p, edit!.date, edit!.block.id, scope)); setEdit(null) }} />
    </div>
  )
}

function TimeRow({ time, title, muted }: { time: string; title: string; muted?: boolean }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
      <span className="num w-[86px] shrink-0 text-[13px] text-muted">{time}</span>
      <span className={'text-[14px] ' + (muted ? 'text-muted' : '')}>{title}</span>
    </div>
  )
}

const timeLabel = (b: Block) => `${b.start}${b.end ? `–${b.end}` : ''}`

function BlockRow({ block, on, active, onToggle, onEdit }: { block: Block; on: boolean; active: boolean; onToggle: () => void; onEdit: () => void }) {
  const fixed = isFixed(block)
  const pillar = blockPillar(block)
  return (
    <div className="flex min-h-[52px] items-center">
      <button type="button" onClick={onEdit} aria-label={`Bewerken: ${block.title}`} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left transition-colors active:bg-sunken">
        <span className="num w-[86px] shrink-0 text-[13px] text-muted">{timeLabel(block)}</span>
        <div className="min-w-0 flex-1">
          <div className={'flex items-center gap-2 truncate text-[15px] ' + (fixed ? 'text-muted' : 'font-medium')}>
            {block.title}
            {active && <Pill tone="success">nu</Pill>}
          </div>
          {catInfo(block.cat).label !== block.title && <div className="text-[12px] text-muted">{catInfo(block.cat).label}{pillar && pillar !== 'geest' && catInfo(block.cat).label !== PILLARS.find((p) => p.id === pillar)!.name ? ` · ${PILLARS.find((p) => p.id === pillar)!.name}` : ''}</div>}
        </div>
      </button>
      {fixed ? <span className="w-4" /> : (
        <button type="button" onClick={onToggle} aria-pressed={on} aria-label={`${on ? 'Ongedaan maken' : 'Afvinken'}: ${block.title}`} className="grid h-[52px] w-14 shrink-0 place-items-center">
          <Check on={on} />
        </button>
      )}
    </div>
  )
}

interface EditState { block: Block; date: string; isNew: boolean; scope: 'dag' | 'week' }

/** Blok toevoegen of aanpassen: soort, titel, tijd, en of het voor één dag of elke week geldt. */
type BlockSheetProps = { edit: EditState | null; onClose: () => void; onSave: (b: Block, scope: 'dag' | 'week') => void; onDelete: (scope: 'dag' | 'week') => void }
function BlockSheet(props: BlockSheetProps) {
  // Nieuwe sleutel per blok, zodat het formulier altijd met de juiste gegevens begint.
  return props.edit ? <BlockForm key={`${props.edit.block.id}:${props.edit.scope}:${props.edit.date}`} {...props} edit={props.edit} /> : null
}
function BlockForm({ edit, onClose, onSave, onDelete }: BlockSheetProps & { edit: EditState }) {
  const [b, setB] = useState<Block>(edit.block)
  const [scope, setScope] = useState<'dag' | 'week'>(edit.scope)
  const [err, setErr] = useState('')
  const fromWeek = edit.scope === 'week'
  const d = parseISO(edit.date)
  const dayName = WEEKDAYS[d.getDay()]
  const pickCat = (cat: Block['cat']) => setB((x) => ({ ...x, cat, title: !x.title || x.title === catInfo(x.cat).label || x.title === 'ION of school' ? catInfo(cat).label : x.title }))
  const save = () => {
    if (!/^\d{2}:\d{2}$/.test(b.start)) { setErr('Vul een begintijd in.'); return }
    if (b.end && b.end <= b.start) { setErr('De eindtijd moet na de begintijd liggen.'); return }
    onSave({ ...b, title: b.title.trim() || catInfo(b.cat).label, end: b.end || undefined }, scope)
  }
  return (
    <Sheet open onClose={onClose} title={edit.isNew ? 'Blok toevoegen' : 'Blok aanpassen'}>
      <div className="flex flex-col gap-5">
        <Field label="Soort">
          <div className="flex flex-wrap gap-2">
            {CATS.map((c) => (
              <button key={c.id} type="button" onClick={() => pickCat(c.id)} aria-pressed={b.cat === c.id}
                className={'min-h-[40px] rounded-full px-4 text-[14px] font-medium transition-colors ' + (b.cat === c.id ? 'bg-accent text-accent-ink' : 'bg-sunken text-ink')}>{c.label}</button>
            ))}
          </div>
        </Field>
        <Field label="Titel"><input id="block-title" className={inputCls} value={b.title} placeholder={catInfo(b.cat).label} onChange={(e) => { const v = e.target.value; setB((x) => ({ ...x, title: v })) }} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Begin"><input id="block-start" type="time" className={inputCls} value={b.start} onChange={(e) => { const v = e.target.value; setB((x) => ({ ...x, start: v })) }} /></Field>
          <Field label="Eind"><input id="block-end" type="time" className={inputCls} value={b.end ?? ''} onChange={(e) => { const v = e.target.value; setB((x) => ({ ...x, end: v })) }} /></Field>
        </div>
        {fromWeek
          ? <p className="text-[14px] text-muted">Geldt voor elke {dayName}.</p>
          : <Field label="Geldt voor">
              <Segmented value={scope} onChange={setScope} options={[{ value: 'dag', label: `Alleen ${d.getDate()} ${['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][d.getMonth()]}` }, { value: 'week', label: `Elke ${dayName}` }]} />
            </Field>}
        {err && <p className="text-[14px] text-danger" role="alert">{err}</p>}
        <Button onClick={save}>Opslaan</Button>
        {!edit.isNew && <Button variant="danger" onClick={() => onDelete(scope)}>{scope === 'week' ? `Verwijderen uit elke ${dayName}` : 'Verwijderen voor deze dag'}</Button>}
      </div>
    </Sheet>
  )
}

function PillarSheet({ pillar, plan, today, onClose, onSave }: { pillar: Pillar | null; plan: PlanData; today: string; onClose: () => void; onSave: (fn: (p: PlanData) => PlanData) => void }) {
  const [value, setValue] = useState('')
  const [goal, setGoal] = useState('')
  useEffect(() => {
    if (!pillar) return
    setValue(pillar.metric.kind === 'manual' ? String(plan.metrics[pillar.id] ?? 0).replace('.', ',') : '')
    setGoal(plan.goals[pillar.id] || pillar.goal)
  }, [pillar]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!pillar) return null
  const m = pillar.metric
  const pr = pillarProgress(plan, pillar, today)
  const habitIds = HABITS.filter((h) => h.pillar === pillar.id)
  const save = () => {
    const n = Number(value.replace(',', '.'))
    onSave((p) => ({
      ...p,
      metrics: m.kind === 'manual' && Number.isFinite(n) && n >= 0 ? { ...p.metrics, [pillar.id]: n } : p.metrics,
      goals: { ...p.goals, [pillar.id]: goal.trim() && goal.trim() !== pillar.goal ? goal.trim() : undefined },
    }))
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={pillar.name}>
      <div className="flex flex-col gap-5">
        <div className="panel flex items-center gap-4 p-4">
          <Ring value={pr.value} size={64} stroke={6} tone={pr.value >= 1 ? 'success' : 'accent'}><span className="num text-[14px] font-semibold">{Math.round(pr.value * 100)}%</span></Ring>
          <div className="min-w-0">
            <div className="text-[13px] text-muted">{m.label}</div>
            <div className="num text-[20px] font-semibold">{pr.label}</div>
          </div>
        </div>
        {m.kind === 'manual' && (
          <Field label={`${m.label} (${m.unit})`} hint={`Doel: ${m.target} ${m.unit}`}>
            <input className={inputCls} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} id="pillar-value" />
          </Field>
        )}
        {m.kind === 'habit' && <p className="text-[14px] text-muted">Dit rekent de app zelf uit op basis van je afgevinkte gewoontes.</p>}
        <Field label="Jaardoel 2027">
          <textarea className={inputCls + ' min-h-[84px] resize-none'} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
        {pillar.id === 'geld' && <p className="text-[14px] text-muted">Volgende automatische inleg: {formatDate(nextInvestDay(today))}. Bedragen houd je bij in de Finance-tabbladen.</p>}
        {habitIds.length > 0 && <p className="text-[13px] text-muted">Dagelijkse gewoontes: {habitIds.map((h) => h.title.toLowerCase()).join(', ')}.</p>}
        <Button onClick={save}>Opslaan</Button>
      </div>
    </Sheet>
  )
}

function ReviewSheet({ open, plan, weekKey, today, onClose, onSave }: { open: boolean; plan: PlanData; weekKey: string; today: string; onClose: () => void; onSave: (fn: (p: PlanData) => PlanData) => void }) {
  const r = plan.reviews[weekKey] ?? { done: [], note: '' }
  const tr = trainingsThisWeek(plan, today)
  const bedNights = weekDays(today).filter((d) => d <= today && (plan.days[d]?.h ?? []).includes('bed')).length
  const set = (next: { done: number[]; note: string }) => onSave((p) => ({ ...p, reviews: { ...p.reviews, [weekKey]: next } }))
  return (
    <Sheet open={open} onClose={onClose} title={`Weekreview ${formatDate(weekKey)}`}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2">
          <div className="panel p-3"><Stat label="Trainingen" value={`${tr.done}/${tr.planned}`} /></div>
          <div className="panel p-3"><Stat label="Op tijd bed" value={`${bedNights}/7`} /></div>
          <div className="panel p-3"><Stat label="Week" value={`${Math.round(weekScore(plan, today) * 100)}%`} /></div>
        </div>
        <List>
          {REVIEW_QUESTIONS.map((q, i) => {
            const on = r.done.includes(i)
            return (
              <button key={i} type="button" aria-pressed={on} onClick={() => set({ ...r, done: on ? r.done.filter((x) => x !== i) : [...r.done, i] })} className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left active:bg-sunken">
                <Check on={on} /><span className="text-[15px]">{q}</span>
              </button>
            )
          })}
        </List>
        <Field label="Notitie voor volgende week">
          <textarea className={inputCls + ' min-h-[96px] resize-none'} value={r.note} onChange={(e) => set({ ...r, note: e.target.value })} placeholder="De ene ION-taak, deadlines, afspraken" />
        </Field>
        <Button onClick={onClose}>Klaar</Button>
      </div>
    </Sheet>
  )
}

function WeekSheet({ open, plan, date, onClose, onEdit, onReset }: { open: boolean; plan: PlanData; date: string; onClose: () => void; onEdit: (b: Block, date: string, isNew: boolean) => void; onReset: () => void }) {
  const tpl = weekTemplate(plan)
  return (
    <Sheet open={open} onClose={onClose} title="Mijn week">
      <div className="flex flex-col gap-5">
        <p className="text-[14px] text-muted">Je vaste week. Tik op een blok om het aan te passen; dat geldt dan voor elke week. Elke dag 06:30 op en 23:00 slapen.</p>
        {weekDays(date).map((d) => {
          const dow = parseISO(d).getDay()
          return (
            <Section key={d} title={WEEKDAYS[dow]}>
              <List>
                {[...tpl[dow]].sort((a, z) => a.start.localeCompare(z.start)).map((bl) => (
                  <button key={bl.id} type="button" onClick={() => onEdit(bl, d, false)} aria-label={`Bewerken: ${WEEKDAYS[dow]} ${bl.title}`} className="flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-sunken">
                    <span className="num w-[86px] shrink-0 text-[13px] text-muted">{timeLabel(bl)}</span>
                    <span className={'flex-1 truncate text-[15px] ' + (isFixed(bl) ? 'text-muted' : 'font-medium')}>{bl.title}</span>
                    <span className="text-[12px] text-muted">{catInfo(bl.cat).label}</span>
                  </button>
                ))}
                <button type="button" onClick={() => onEdit({ id: newBlockId(), start: '19:30', end: '21:00', title: '', cat: 'ion' }, d, true)} className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-muted active:bg-sunken">
                  <span className="w-[86px] shrink-0 text-center text-[18px] leading-none" aria-hidden>+</span>Blok toevoegen
                </button>
              </List>
            </Section>
          )
        })}
        <Button variant="secondary" onClick={onClose}>Klaar</Button>
        {plan.week && <button type="button" className="self-center text-[13px] text-muted underline underline-offset-2" onClick={onReset}>Startweek terugzetten</button>}
      </div>
    </Sheet>
  )
}
