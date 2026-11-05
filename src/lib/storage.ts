import type { AppData, MonthPlan, Settings, Transaction } from './types'
import { emptyData, LEGACY_SALARY_DAY } from './defaults'
import { currentMonth, todayISO } from './dates'

/* Opslagstrategie
 * 1. Binnen Claude (privé Artifact): de `db`-capability bewaart je gegevens in je Claude-account,
 *    in een privémap die alleen jij kunt lezen (data/users/<jouw id>/...).
 * 2. Altijd ook lokaal (localStorage) als snelle cache en als enige opslag wanneer de app
 *    los wordt gehost (GitHub Pages).
 * 3. Elke dag een automatische lokale back-up (laatste 14 dagen), plus JSON/CSV-export. */

const LOCAL_KEY = 'financial-reset:v1'
const BACKUP_PREFIX = 'financial-reset:backup:'
const KEEP_BACKUPS = 14

export type StorageMode = 'cloud' | 'local' | 'memory'

function safeLocal(): Storage | null {
  try {
    const ls = window.localStorage
    const k = '__fr_test__'
    ls.setItem(k, '1'); ls.removeItem(k)
    return ls
  } catch { return null }
}

export function isValidData(d: unknown): d is AppData {
  if (!d || typeof d !== 'object') return false
  const x = d as AppData
  return !!x.settings && Array.isArray(x.settings.items) && Array.isArray(x.transactions) && typeof x.months === 'object'
}

/** Vult ontbrekende velden aan zodat oudere back-ups blijven werken. */
export function migrate(d: AppData): AppData {
  const base = emptyData()
  const out: AppData = {
    settings: { ...base.settings, ...d.settings, setupDone: d.settings.setupDone ?? true, goal: { ...base.settings.goal, ...d.settings.goal }, reminders: d.settings.reminders?.length ? d.settings.reminders : base.settings.reminders },
    months: d.months ?? {},
    transactions: (d.transactions ?? []).filter((t) => t && typeof t.amount === 'number' && Number.isInteger(t.amount)),
    dismissed: d.dismissed ?? [],
  }
  return applyDataUpdates(out)
}

/** Eenmalige updates voor bestaande gegevens. Wordt maar één keer toegepast, zodat latere eigen keuzes blijven staan. */
export function applyDataUpdates(d: AppData): AppData {
  const done = d.settings.migrations ?? []
  if (done.includes('salary-day-25')) return d
  // Salaris komt altijd op de 25e binnen: vul dat in waar de dag nog onbekend was (instellingen + lopende en toekomstige maanden).
  const cur = currentMonth()
  const items = d.settings.items.map((i) => (i.kind === 'income' && i.id === 'income' && i.dueDay == null ? { ...i, dueDay: LEGACY_SALARY_DAY } : i))
  const months = { ...d.months }
  for (const [m, plan] of Object.entries(months)) {
    if (m < cur) continue
    months[m] = { ...plan, items: plan.items.map((i) => (i.id === 'income' && i.dueDay == null ? { ...i, dueDay: LEGACY_SALARY_DAY } : i)) }
  }
  return { ...d, months, settings: { ...d.settings, items, migrations: [...done, 'salary-day-25'] } }
}

export function loadLocal(): AppData | null {
  const ls = safeLocal()
  if (!ls) return null
  try {
    const raw = ls.getItem(LOCAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isValidData(parsed) ? migrate(parsed) : null
  } catch { return null }
}

export function saveLocal(data: AppData): boolean {
  const ls = safeLocal()
  if (!ls) return false
  try {
    const json = JSON.stringify(data)
    ls.setItem(LOCAL_KEY, json)
    const today = BACKUP_PREFIX + todayISO()
    if (!ls.getItem(today) && data.transactions.length > 0) {
      ls.setItem(today, json)
      const keys = Object.keys(ls).filter((k) => k.startsWith(BACKUP_PREFIX)).sort()
      keys.slice(0, Math.max(0, keys.length - KEEP_BACKUPS)).forEach((k) => ls.removeItem(k))
    }
    return true
  } catch { return false }
}

export function listLocalBackups(): { date: string; count: number; data: AppData }[] {
  const ls = safeLocal()
  if (!ls) return []
  const out: { date: string; count: number; data: AppData }[] = []
  for (const k of Object.keys(ls).filter((k) => k.startsWith(BACKUP_PREFIX)).sort().reverse()) {
    try {
      const d = JSON.parse(ls.getItem(k) || '')
      if (isValidData(d)) out.push({ date: k.slice(BACKUP_PREFIX.length), count: d.transactions.filter((t) => !t.deletedAt).length, data: migrate(d) })
    } catch { /* overslaan */ }
  }
  return out
}

/* ---------------- Cloud (Claude db-capability) ---------------- */

interface DocRef { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
interface CollectionRef { doc(id: string): DocRef; get(): Promise<{ docs: { id: string; exists: boolean; data(): Record<string, unknown> | undefined }[] }> }
interface DB { collection(path: string): CollectionRef }
interface UserNS { id(): Promise<string | null> }
declare global { interface Window { claude?: { use(name: string): Promise<unknown> } } }

function splitDocs(data: AppData): Record<string, Record<string, unknown>> {
  const docs: Record<string, Record<string, unknown>> = {
    settings: { settings: data.settings as unknown as Record<string, unknown>, dismissed: data.dismissed.slice(-300) },
    months: { months: data.months as unknown as Record<string, unknown> },
  }
  const byMonth: Record<string, Transaction[]> = {}
  for (const t of data.transactions) (byMonth[t.month] ??= []).push(t)
  for (const [m, list] of Object.entries(byMonth)) docs['tx-' + m] = { month: m, items: list as unknown as Record<string, unknown>[] }
  return docs
}

function joinDocs(docs: { id: string; data: Record<string, unknown> }[]): AppData | null {
  const s = docs.find((d) => d.id === 'settings')
  if (!s) return null
  const months = (docs.find((d) => d.id === 'months')?.data.months ?? {}) as Record<string, MonthPlan>
  const transactions = docs.filter((d) => d.id.startsWith('tx-')).flatMap((d) => (d.data.items ?? []) as Transaction[])
  const data = { settings: s.data.settings as Settings, dismissed: (s.data.dismissed ?? []) as string[], months, transactions }
  return isValidData(data) ? migrate(data) : null
}

const PREFIX = 'fr-'

export class CloudStore {
  private col: CollectionRef
  private last: Record<string, string> = {}
  private queue: Promise<unknown> = Promise.resolve()
  constructor(col: CollectionRef) { this.col = col }

  static async connect(timeoutMs = 9000): Promise<CloudStore | null> {
    if (typeof window === 'undefined' || !window.claude?.use) return null
    const withTimeout = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))])
    try {
      const [db, user] = (await withTimeout(Promise.all([window.claude.use('db'), window.claude.use('user')]))) ?? [null, null]
      if (!db || !user) return null
      const id = await (user as UserNS).id()
      if (!id) return null
      // Privécollectie: alleen jij kunt deze documenten lezen of schrijven.
      return new CloudStore((db as DB).collection(`data/users/${id}`))
    } catch { return null }
  }

  async load(): Promise<AppData | null> {
    const snap = await this.col.get()
    const docs = snap.docs.filter((d) => d.exists && d.id.startsWith(PREFIX)).map((d) => ({ id: d.id.slice(PREFIX.length), data: d.data() ?? {} }))
    for (const d of docs) this.last[d.id] = JSON.stringify(d.data)
    return joinDocs(docs)
  }

  /** Schrijft alleen documenten die echt veranderd zijn, één voor één. */
  save(data: AppData): Promise<void> {
    const run = async () => {
      const docs = splitDocs(data)
      for (const [id, body] of Object.entries(docs)) {
        const json = JSON.stringify(body)
        if (this.last[id] === json) continue
        await this.col.doc(PREFIX + id).set(JSON.parse(json))
        this.last[id] = json
      }
      for (const id of Object.keys(this.last)) {
        if (!docs[id]) { await this.col.doc(PREFIX + id).delete(); delete this.last[id] }
      }
    }
    const p = this.queue.then(run, run)
    this.queue = p.catch(() => undefined)
    return p
  }
}

/* ---------------- Export / import ---------------- */

export function exportJSON(data: AppData): string {
  return JSON.stringify({ app: 'Finance', exportedAt: new Date().toISOString(), data }, null, 2)
}

export function importJSON(text: string): AppData {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('Dit bestand is geen geldige back-up (geen JSON).') }
  const d = (parsed && typeof parsed === 'object' && 'data' in parsed ? (parsed as { data: unknown }).data : parsed)
  if (!isValidData(d)) throw new Error('Dit bestand bevat geen Finance-gegevens.')
  return migrate(d)
}
