/* Persoonlijk plan (10-jarenplan): standaardweek, dagelijkse gewoontes en zes pijlers.
 * Staat los van de financiële gegevens, in een eigen opslagsleutel op dit apparaat.
 * Alleen in de versie van Dave (zonder OWNER); de versie van Sophie heeft dit tabblad niet. */
import { pad, todayISO } from './dates'

export type PillarId = 'ondernemen' | 'lichaam' | 'geld' | 'geest' | 'communicatie' | 'uitstraling'
export type PhaseId = 'fase1' | 'fase2' | 'fase3'

export interface Block {
  id: string
  start: string // "17:15"
  end?: string
  title: string
  pillar?: PillarId
  /** Vaste afspraak (werk, school): context, niet af te vinken. */
  fixed?: boolean
  /** Training: afvinken telt ook als "Bewegen". */
  training?: boolean
}

export interface Phase { id: PhaseId; name: string; short: string; from: string; note: string; week: Block[][] }

const b = (id: string, start: string, end: string | undefined, title: string, extra: Partial<Block> = {}): Block => ({ id, start, end, title, ...extra })
const werk = (d: string) => b(`werk-${d}`, '08:30', '17:00', 'Werk', { fixed: true })
const school = (d: string, s: string, e: string) => b(`school-${d}`, s, e, 'School', { fixed: true })
const kracht = (d: string) => b(`kracht-${d}`, '17:15', '18:30', 'Kracht', { pillar: 'lichaam', training: true })
const review = b('review', '19:00', '19:30', 'Weekreview', { pillar: 'geest' })
const ionZo = b('ion-zo', '10:00', '12:00', 'ION-blok', { pillar: 'ondernemen' })

/** Index 0 = zondag, zoals Date.getDay(). */
export const PHASES: Phase[] = [
  {
    id: 'fase1', name: 'Nu t/m december', short: 'Nu–dec', from: '2000-01-01',
    note: 'Lichtere variant: voetbal loopt nog, alleen het ritme en de lege plekken vullen.',
    week: [
      [ionZo, review],
      [werk('ma'), b('gym-ma', '17:00', '18:30', 'Gym / voetbal', { pillar: 'lichaam', training: true }), school('ma', '20:00', '22:00')],
      [school('di', '09:20', '17:00'), b('voetbal-di', '20:00', '22:00', 'Voetbal', { pillar: 'lichaam', training: true })],
      [werk('wo'), b('studie-wo', '19:30', '21:00', 'Studieblok')],
      [werk('do'), school('do', '19:30', '22:00')],
      [werk('vr'), school('vr', '20:00', '22:00')],
      [b('loop-za', '08:30', '09:30', 'Rustige duurloop', { pillar: 'lichaam', training: true }), school('za', '11:00', '13:00')],
    ],
  },
  {
    id: 'fase2', name: 'Januari t/m zomer 2027', short: 'Jan–zomer', from: '2027-01-01',
    note: 'Je standaardweek: geen voetbal, opleiding loopt. Bij deadlines wint school van ION.',
    week: [
      [ionZo, review],
      [werk('ma'), kracht('ma'), school('ma', '20:00', '22:00')],
      [b('loop-di', '07:00', '07:45', 'Hardlopen', { pillar: 'lichaam', training: true }), school('di', '09:20', '17:00'), b('ion-di', '20:00', '21:30', 'ION-blok', { pillar: 'ondernemen' })],
      [werk('wo'), kracht('wo'), b('studie-wo', '19:30', '21:00', 'Studieblok')],
      [werk('do'), school('do', '19:30', '22:00')],
      [werk('vr'), kracht('vr'), school('vr', '20:00', '22:00')],
      [b('loop-za', '08:30', '09:30', 'Lange duurloop', { pillar: 'lichaam', training: true }), school('za', '11:00', '13:00')],
    ],
  },
  {
    id: 'fase3', name: 'Na de opleiding', short: 'Na opleiding', from: '2027-07-01',
    note: 'De schooltijd schuift grotendeels naar ION, ongeveer 10 uur per week.',
    week: [
      [ionZo, review],
      [werk('ma'), kracht('ma'), b('ion-ma', '19:30', '21:30', 'ION-blok', { pillar: 'ondernemen' })],
      [b('loop-di', '06:45', '07:30', 'Hardlopen', { pillar: 'lichaam', training: true }), werk('di'), b('ion-di', '20:00', '21:30', 'ION-blok', { pillar: 'ondernemen' })],
      [werk('wo'), kracht('wo'), b('lezen-wo', '19:30', '20:30', 'Lezen en communicatie', { pillar: 'communicatie' })],
      [b('loop-do', '07:00', '07:45', 'Hardlopen', { pillar: 'lichaam', training: true }), werk('do'), b('ion-do', '19:30', '21:30', 'ION-blok', { pillar: 'ondernemen' })],
      [werk('vr'), kracht('vr'), b('vrij-vr', '19:00', undefined, 'Vrije avond', { fixed: true })],
      [b('loop-za', '08:30', '09:30', 'Lange duurloop', { pillar: 'lichaam', training: true }), b('ion-za', '10:30', '12:30', 'ION-blok', { pillar: 'ondernemen' })],
    ],
  },
]

export interface Habit { id: string; title: string; hint: string; pillar: PillarId }
export const HABITS: Habit[] = [
  { id: 'op', title: 'Op tijd op', hint: '06:30', pillar: 'lichaam' },
  { id: 'skin-am', title: 'Skincare ochtend', hint: 'RESET, REFINE, SHIELD', pillar: 'uitstraling' },
  { id: 'bewegen', title: 'Bewegen', hint: 'training, loop of wandeling', pillar: 'lichaam' },
  { id: 'ion', title: 'Eén ION-taak', hint: 'klein is goed', pillar: 'ondernemen' },
  { id: 'lezen', title: 'Lezen of reflecteren', hint: '10 minuten', pillar: 'geest' },
  { id: 'skin-pm', title: 'Skincare avond', hint: 'voor het slapen', pillar: 'uitstraling' },
  { id: 'bed', title: 'Op tijd naar bed', hint: '23:00, schermen weg om 22:00', pillar: 'lichaam' },
]

export type MetricKind = 'manual' | 'habit'
export interface Pillar {
  id: PillarId
  name: string
  goal: string // jaardoel 2027
  metric: { kind: 'manual'; label: string; target: number; unit: string } | { kind: 'habit'; label: string; habits: string[] }
}
export const PILLARS: Pillar[] = [
  { id: 'ondernemen', name: 'Ondernemen', goal: 'ION gelanceerd, eind 2027 50 sets per maand', metric: { kind: 'manual', label: 'Sets per maand', target: 50, unit: 'sets' } },
  { id: 'lichaam', name: 'Lichaam', goal: 'Van 0 naar 10 km hardlopen, 3× per week kracht', metric: { kind: 'manual', label: 'Langste loop', target: 10, unit: 'km' } },
  { id: 'geld', name: 'Geld', goal: 'Elke 25e automatisch beleggen, buffer van 3 maanden', metric: { kind: 'manual', label: 'Buffer', target: 3, unit: 'mnd' } },
  { id: 'geest', name: 'Geest', goal: 'Discipline en rust: dagelijks lezen of reflecteren, matig drinken', metric: { kind: 'habit', label: 'Lezen, laatste 30 dagen', habits: ['lezen'] } },
  { id: 'communicatie', name: 'Communicatie', goal: 'Helder articuleren en mensen beter lezen: elke week bewust oefenen', metric: { kind: 'manual', label: 'Oefenmomenten deze maand', target: 4, unit: 'keer' } },
  { id: 'uitstraling', name: 'Uitstraling', goal: 'Huid en kleding verzorgd, elke dag', metric: { kind: 'habit', label: 'Skincare, laatste 30 dagen', habits: ['skin-am', 'skin-pm'] } },
]

export interface DayLog { h: string[]; b: string[] }
export interface PlanData {
  v: 1
  days: Record<string, DayLog>
  /** Handmatige waarden per pijler (bijv. langste loop in km). */
  metrics: Partial<Record<PillarId, number>>
  /** Eigen tekst voor het jaardoel, als je die aanpast. */
  goals: Partial<Record<PillarId, string>>
  phase: 'auto' | PhaseId
  /** Weekreview per week (sleutel = datum van de maandag). */
  reviews: Record<string, { done: number[]; note: string }>
}

export const emptyPlan = (): PlanData => ({ v: 1, days: {}, metrics: {}, goals: {}, phase: 'auto', reviews: {} })

export const REVIEW_QUESTIONS = [
  'Hoeveel trainingen gedaan? Enkels oké?',
  'Op tijd naar bed geweest (minstens 5 van 7 avonden)?',
  'Wat staat er deze week voor school (deadlines, toetsen)?',
  'Wat is de ene ION-taak die deze week af moet?',
  'Sociale afspraken en Sophie ingepland? Botst iets met school?',
  'Geld: rekeningen op de 25e, beleggen gedaan?',
]

/* ---------- datums ---------- */
export function parseISO(iso: string): Date { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
export function addDays(iso: string, n: number): string { const d = parseISO(iso); d.setDate(d.getDate() + n); return todayISO(d) }
/** Maandag van de week waarin iso valt. */
export function weekStart(iso: string): string { const dow = parseISO(iso).getDay(); return addDays(iso, -((dow + 6) % 7)) }
export function weekDays(iso: string): string[] { const s = weekStart(iso); return Array.from({ length: 7 }, (_, i) => addDays(s, i)) }
export const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const nowHHMM = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/* ---------- fase en planning ---------- */
export function autoPhase(iso: string): PhaseId {
  let id: PhaseId = 'fase1'
  for (const p of PHASES) if (iso >= p.from) id = p.id
  return id
}
export function phaseFor(plan: PlanData, iso: string): Phase {
  const id = plan.phase === 'auto' ? autoPhase(iso) : plan.phase
  return PHASES.find((p) => p.id === id)!
}
export function blocksFor(plan: PlanData, iso: string): Block[] {
  return [...phaseFor(plan, iso).week[parseISO(iso).getDay()]].sort((a, z) => toMinutes(a.start) - toMinutes(z.start))
}
/** Het blok dat nu bezig is, anders het eerstvolgende. */
export function currentBlock(blocks: Block[], hhmm: string): { block: Block; state: 'now' | 'next' } | null {
  const t = toMinutes(hhmm)
  for (const bl of blocks) {
    const s = toMinutes(bl.start), e = bl.end ? toMinutes(bl.end) : s + 60
    if (t >= s && t < e) return { block: bl, state: 'now' }
    if (t < s) return { block: bl, state: 'next' }
  }
  return null
}

/* ---------- acties (puur, geven een nieuw object terug) ---------- */
const day = (p: PlanData, iso: string): DayLog => p.days[iso] ?? { h: [], b: [] }
const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

export function toggleHabit(p: PlanData, iso: string, id: string): PlanData {
  const d = day(p, iso)
  return { ...p, days: { ...p.days, [iso]: { ...d, h: toggle(d.h, id) } } }
}
/** Een training afvinken vinkt ook "Bewegen" af (maar uitvinken laat Bewegen staan). */
export function toggleBlock(p: PlanData, iso: string, block: Block): PlanData {
  const d = day(p, iso)
  const on = !d.b.includes(block.id)
  const h = on && block.training && !d.h.includes('bewegen') ? [...d.h, 'bewegen'] : d.h
  return { ...p, days: { ...p.days, [iso]: { h, b: toggle(d.b, block.id) } } }
}

/* ---------- statistiek ---------- */
export function habitsDone(p: PlanData, iso: string): number {
  const ids = new Set(HABITS.map((h) => h.id))
  return day(p, iso).h.filter((h) => ids.has(h)).length
}
export function dayScore(p: PlanData, iso: string): number { return habitsDone(p, iso) / HABITS.length }

/** Aantal dagen op rij (tot en met vandaag, of tot gisteren als vandaag nog loopt) met minstens 5 van 7 gewoontes. */
export function streak(p: PlanData, today: string, min = 5): number {
  let n = 0
  let d = habitsDone(p, today) >= min ? today : addDays(today, -1)
  while (habitsDone(p, d) >= min) { n++; d = addDays(d, -1) }
  return n
}

/** Gemiddelde score van de week tot en met vandaag. */
export function weekScore(p: PlanData, today: string): number {
  const days = weekDays(today).filter((d) => d <= today)
  return days.reduce((s, d) => s + dayScore(p, d), 0) / days.length
}

export function trainingsThisWeek(p: PlanData, today: string): { done: number; planned: number } {
  let done = 0, planned = 0
  for (const d of weekDays(today)) {
    const tr = blocksFor(p, d).filter((x) => x.training)
    planned += tr.length
    done += tr.filter((x) => day(p, d).b.includes(x.id)).length
  }
  return { done, planned }
}

/** Fractie van de laatste n dagen waarop alle genoemde gewoontes gedaan zijn. */
export function habitRate(p: PlanData, today: string, habits: string[], n = 30): number {
  let hit = 0
  for (let i = 0; i < n; i++) { const d = day(p, addDays(today, -i)); hit += habits.filter((h) => d.h.includes(h)).length / habits.length }
  return hit / n
}

export function pillarProgress(p: PlanData, pillar: Pillar, today: string): { value: number; label: string } {
  const m = pillar.metric
  if (m.kind === 'habit') { const r = habitRate(p, today, m.habits); return { value: r, label: `${Math.round(r * 100)}%` } }
  const v = p.metrics[pillar.id] ?? 0
  return { value: Math.min(1, v / m.target), label: `${fmtNum(v)} / ${m.target} ${m.unit}` }
}

export const fmtNum = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })

/** Volgende 25e (dag van salaris en automatische inleg). */
export function nextInvestDay(today: string): string {
  const d = parseISO(today)
  const t = new Date(d.getFullYear(), d.getMonth() + (d.getDate() > 25 ? 1 : 0), 25)
  return todayISO(t)
}

/* ---------- opslag ---------- */
const KEY = `${__STORAGE_PREFIX__}:plan:v1`

export function isValidPlan(x: unknown): x is PlanData {
  const p = x as PlanData
  return !!p && typeof p === 'object' && p.v === 1 && typeof p.days === 'object' && p.days !== null
}
export function loadPlan(): PlanData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { const p = JSON.parse(raw); if (isValidPlan(p)) return { ...emptyPlan(), ...p } }
  } catch { /* geen opslag of kapotte gegevens: begin leeg */ }
  return emptyPlan()
}
export function savePlan(p: PlanData): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true } catch { return false }
}
