/* Persoonlijk plan (10-jarenplan): standaardweek, dagelijkse gewoontes en zes pijlers.
 * Staat los van de financiële gegevens, in een eigen opslagsleutel op dit apparaat.
 * Alleen in de versie van Dave (zonder OWNER); de versie van Sophie heeft dit tabblad niet. */
import { pad, todayISO } from './dates'

export type PillarId = 'ondernemen' | 'lichaam' | 'geld' | 'geest' | 'communicatie' | 'uitstraling'

/** Soort blok in je agenda. Bepaalt pijler, of het een training is en of je het kunt afvinken. */
export type Cat = 'werk' | 'school' | 'sport' | 'ion' | 'studie' | 'eigen'
export const CATS: { id: Cat; label: string; pillar?: PillarId }[] = [
  { id: 'werk', label: 'Werk' },
  { id: 'school', label: 'School' },
  { id: 'sport', label: 'Sport', pillar: 'lichaam' },
  { id: 'ion', label: 'ION', pillar: 'ondernemen' },
  { id: 'studie', label: 'Studie' },
  { id: 'eigen', label: 'Eigen tijd', pillar: 'geest' },
]
export const catInfo = (c: Cat) => CATS.find((x) => x.id === c) ?? CATS[CATS.length - 1]

export interface Block {
  id: string
  start: string // "17:15"
  end?: string
  title: string
  cat: Cat
}
/** Werk is context (niet af te vinken); de rest vink je af. Sport telt ook als "Bewegen". */
export const isFixed = (b: Block) => b.cat === 'werk'
export const isTraining = (b: Block) => b.cat === 'sport'
export const blockPillar = (b: Block) => catInfo(b.cat).pillar

const bl = (id: string, start: string, end: string | undefined, title: string, cat: Cat): Block => ({ id, start, end, title, cat })
const workday = (d: string): Block[] => [
  bl(`${d}-werk`, '08:30', '17:00', 'Werk', 'werk'),
  bl(`${d}-sport`, '17:15', '18:30', 'Sporten', 'sport'),
  bl(`${d}-avond`, '19:30', '21:30', 'ION of school', 'ion'),
]
/** Startweek (index 0 = zondag, zoals Date.getDay()). Alles is in de app aan te passen. */
export const DEFAULT_WEEK: Block[][] = [
  [bl('zo-ion', '10:00', '12:00', 'ION-blok', 'ion'), bl('zo-review', '19:00', '19:30', 'Weekreview', 'eigen')],
  workday('ma'),
  [bl('di-school', '09:30', '17:00', 'School', 'school'), bl('di-sport', '17:30', '18:30', 'Sporten', 'sport'), bl('di-avond', '19:30', '21:30', 'ION of school', 'ion')],
  workday('wo'),
  workday('do'),
  workday('vr'),
  [bl('za-loop', '08:30', '09:30', 'Lange duurloop', 'sport'), bl('za-school', '11:00', '13:00', 'School', 'school')],
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
  /** Jouw vaste week (aangepast in de app). Leeg = startweek. */
  week?: Block[][]
  /** Aanpassingen voor één specifieke dag (datum → blokken van die dag). */
  overrides: Record<string, Block[]>
  /** Weekreview per week (sleutel = datum van de maandag). */
  reviews: Record<string, { done: number[]; note: string }>
}

export const emptyPlan = (): PlanData => ({ v: 1, days: {}, metrics: {}, goals: {}, overrides: {}, reviews: {} })

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

/* ---------- planning ---------- */
export const weekTemplate = (p: PlanData): Block[][] => (p.week && p.week.length === 7 ? p.week : DEFAULT_WEEK)
const sortBlocks = (list: Block[]) => [...list].sort((a, z) => toMinutes(a.start) - toMinutes(z.start))
export function blocksFor(p: PlanData, iso: string): Block[] {
  return sortBlocks(p.overrides?.[iso] ?? weekTemplate(p)[parseISO(iso).getDay()])
}
export const isOverridden = (p: PlanData, iso: string) => !!p.overrides?.[iso]
export const newBlockId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

const upsert = (list: Block[], b: Block) => (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b])

/** Blok opslaan: alleen voor deze dag, of voor deze weekdag in elke week. */
export function saveBlock(p: PlanData, iso: string, b: Block, scope: 'dag' | 'week'): PlanData {
  if (scope === 'dag') return { ...p, overrides: { ...p.overrides, [iso]: sortBlocks(upsert(blocksFor(p, iso), b)) } }
  const dow = parseISO(iso).getDay()
  const week = weekTemplate(p).map((day, i) => (i === dow ? sortBlocks(upsert(day, b)) : day))
  const overrides = { ...p.overrides }
  if (overrides[iso]) overrides[iso] = sortBlocks(upsert(overrides[iso], b))
  return { ...p, week, overrides }
}
export function deleteBlock(p: PlanData, iso: string, id: string, scope: 'dag' | 'week'): PlanData {
  if (scope === 'dag') return { ...p, overrides: { ...p.overrides, [iso]: blocksFor(p, iso).filter((x) => x.id !== id) } }
  const dow = parseISO(iso).getDay()
  const overrides = { ...p.overrides }
  if (overrides[iso]) overrides[iso] = overrides[iso].filter((x) => x.id !== id)
  return { ...p, week: weekTemplate(p).map((day, i) => (i === dow ? day.filter((x) => x.id !== id) : day)), overrides }
}
/** Dag terug naar je vaste week. */
export function resetDay(p: PlanData, iso: string): PlanData {
  const overrides = { ...p.overrides }
  delete overrides[iso]
  return { ...p, overrides }
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
  const h = on && isTraining(block) && !d.h.includes('bewegen') ? [...d.h, 'bewegen'] : d.h
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
    const tr = blocksFor(p, d).filter(isTraining)
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
    if (raw) { const p = JSON.parse(raw); if (isValidPlan(p)) return { ...emptyPlan(), ...p, overrides: p.overrides ?? {} } }
  } catch { /* geen opslag of kapotte gegevens: begin leeg */ }
  return emptyPlan()
}
export function savePlan(p: PlanData): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true } catch { return false }
}
