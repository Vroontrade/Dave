import type { AppData, MonthPlan, Transaction, TxType, Settings, PlanItem } from './types'
import type { Cents } from './money'
import { planForMonth, toMonthItem, txTypeForKind } from './calc'
import { isValidISODate, monthOf, type MonthKey } from './dates'

export class ActionError extends Error {}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export const TX_LABEL: Record<TxType, string> = {
  income: 'Inkomen',
  expense: 'Uitgave',
  savings_deposit: 'Spaarstorting',
  savings_withdrawal: 'Spaaropname',
  savings_opening: 'Beginsaldo sparen',
  reserve_deposit: 'Storting autoreserve',
  reserve_expense: 'Onderhoud uit autoreserve',
  reserve_opening: 'Beginsaldo autoreserve',
}

/** Vaste maandplan-momentopname aanmaken (als die nog niet bestaat). */
export function ensureMonth(data: AppData, m: MonthKey, now = new Date()): AppData {
  if (data.months[m]) return data
  const plan: MonthPlan = { ...planForMonth(data, m), createdAt: now.toISOString() }
  return { ...data, months: { ...data.months, [m]: plan } }
}

export interface NewTx {
  type: TxType
  amount: Cents
  date: string
  month?: MonthKey
  itemId?: string
  category?: string
  note?: string
  source?: Transaction['source']
}

function validate(tx: NewTx) {
  if (!Number.isInteger(tx.amount) || tx.amount <= 0) throw new ActionError('Vul een bedrag groter dan €0 in.')
  if (tx.amount > 10_000_000) throw new ActionError('Dat bedrag is ongewoon hoog. Controleer het nog even.')
  if (!isValidISODate(tx.date)) throw new ActionError('Kies een geldige datum.')
  if (tx.month && !/^\d{4}-\d{2}$/.test(tx.month)) throw new ActionError('Ongeldige maand.')
}

/** Een post die maximaal één keer per maand afgevinkt kan worden (alles behalve budgetposten). */
function isSingleItem(data: AppData, month: MonthKey, itemId?: string) {
  if (!itemId) return false
  const it = planForMonth(data, month).items.find((i) => i.id === itemId)
  return !!it && it.kind !== 'budget'
}

export function findLinked(data: AppData, month: MonthKey, itemId: string, type: TxType): Transaction | undefined {
  return data.transactions.find((t) => !t.deletedAt && t.month === month && t.itemId === itemId && t.type === type)
}

export function addTransaction(data: AppData, input: NewTx, now = new Date()): { data: AppData; tx: Transaction } {
  validate(input)
  const month = input.month ?? monthOf(input.date)
  if (input.itemId && isSingleItem(data, month, input.itemId) && findLinked(data, month, input.itemId, input.type)) {
    throw new ActionError('Deze post is deze maand al afgevinkt. Pas de bestaande betaling aan als het bedrag niet klopt.')
  }
  const tx: Transaction = {
    id: uid(),
    type: input.type,
    amount: input.amount,
    date: input.date,
    month,
    itemId: input.itemId,
    category: input.category ?? 'Overig',
    note: (input.note ?? '').slice(0, 200),
    source: input.source ?? 'handmatig',
    createdAt: now.toISOString(),
  }
  let next = ensureMonth(data, month, now)
  next = { ...next, transactions: [...next.transactions, tx] }
  return { data: next, tx }
}

export function updateTransaction(data: AppData, id: string, patch: Partial<Pick<Transaction, 'amount' | 'date' | 'note' | 'category' | 'month'>>, now = new Date()): AppData {
  const old = data.transactions.find((t) => t.id === id)
  if (!old) throw new ActionError('Transactie niet gevonden.')
  const merged = { ...old, ...patch }
  validate({ ...merged })
  if (patch.month && patch.month !== old.month && merged.itemId && isSingleItem(data, patch.month, merged.itemId) && findLinked(data, patch.month, merged.itemId, merged.type)) {
    throw new ActionError('In die maand is deze post al afgevinkt.')
  }
  const history = [...(old.history ?? []), { at: now.toISOString(), amount: old.amount, date: old.date, note: old.note }]
  const updated: Transaction = { ...merged, updatedAt: now.toISOString(), history }
  const base = ensureMonth(data, updated.month, now)
  return { ...base, transactions: base.transactions.map((t) => (t.id === id ? updated : t)) }
}

/** Zacht verwijderen: de transactie gaat naar de prullenbak en telt niet meer mee. */
export function deleteTransaction(data: AppData, id: string, now = new Date()): AppData {
  return { ...data, transactions: data.transactions.map((t) => (t.id === id ? { ...t, deletedAt: now.toISOString() } : t)) }
}

export function restoreTransaction(data: AppData, id: string): AppData {
  const t = data.transactions.find((x) => x.id === id)
  if (!t) throw new ActionError('Transactie niet gevonden.')
  if (t.itemId && isSingleItem(data, t.month, t.itemId) && findLinked(data, t.month, t.itemId, t.type)) {
    throw new ActionError('Deze post is in die maand inmiddels opnieuw afgevinkt. Herstellen zou dubbel tellen.')
  }
  return { ...data, transactions: data.transactions.map((x) => (x.id === id ? { ...x, deletedAt: undefined } : x)) }
}

export function purgeTransaction(data: AppData, id: string): AppData {
  return { ...data, transactions: data.transactions.filter((t) => t.id !== id) }
}

/** Een post afvinken of het afvinken ongedaan maken.
 *  Afvinken maakt precies één gekoppelde transactie; nogmaals afvinken kan niet (dus nooit dubbel aftrekken).
 *  Uitvinken verplaatst die transactie naar de prullenbak (herstelbaar). Budgetposten worden alleen "afgesloten". */
export function toggleItem(data: AppData, month: MonthKey, itemId: string, opts: { date: string; amount?: Cents }, now = new Date()): { data: AppData; checked: boolean; tx?: Transaction } {
  const base = ensureMonth(data, month, now)
  const plan = base.months[month]
  const item = plan.items.find((i) => i.id === itemId)
  if (!item) throw new ActionError('Post niet gevonden in deze maand.')
  if (item.kind === 'budget') {
    const closed = plan.closedBudgets.includes(itemId)
    const closedBudgets = closed ? plan.closedBudgets.filter((x) => x !== itemId) : [...plan.closedBudgets, itemId]
    return { data: { ...base, months: { ...base.months, [month]: { ...plan, closedBudgets } } }, checked: !closed }
  }
  const type = txTypeForKind(item.kind)
  const existing = findLinked(base, month, itemId, type)
  if (existing) return { data: deleteTransaction(base, existing.id, now), checked: false }
  const { data: next, tx } = addTransaction(base, {
    type, amount: opts.amount ?? item.amount, date: opts.date, month, itemId,
    category: item.kind === 'bill' ? item.name : TX_LABEL[type], note: item.name, source: 'checklist',
  }, now)
  return { data: next, checked: true, tx }
}

/** Bedrag of vervaldag van een post alleen voor één maand aanpassen. */
export function updateMonthItem(data: AppData, month: MonthKey, itemId: string, patch: { amount?: Cents; dueDay?: number | null }, now = new Date()): AppData {
  if (patch.amount != null && (!Number.isInteger(patch.amount) || patch.amount < 0)) throw new ActionError('Ongeldig bedrag.')
  if (patch.dueDay != null && (patch.dueDay < 1 || patch.dueDay > 31)) throw new ActionError('Kies een dag tussen 1 en 31.')
  const base = ensureMonth(data, month, now)
  const plan = base.months[month]
  return { ...base, months: { ...base.months, [month]: { ...plan, items: plan.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } } }
}

/** Instellingen wijzigen. Maanden zonder vastgelegde gegevens volgen automatisch; optioneel ook de lopende en toekomstige vastgelegde maanden bijwerken. */
export function updateSettings(data: AppData, settings: Settings, opts: { applyFrom?: MonthKey } = {}, now = new Date()): AppData {
  let months = data.months
  if (opts.applyFrom) {
    months = { ...months }
    for (const [m, plan] of Object.entries(months)) {
      if (m < opts.applyFrom) continue
      const active = settings.items.filter((i) => i.active)
      const items = active.map((p) => {
        const old = plan.items.find((x) => x.id === p.id)
        return old ? { ...old, name: p.name, amount: p.amount, dueDay: p.dueDay, kind: p.kind } : toMonthItem(p)
      })
      // Posten die al betaald zijn blijven zichtbaar, ook als ze nu inactief zijn.
      for (const old of plan.items) if (!items.some((i) => i.id === old.id) && data.transactions.some((t) => !t.deletedAt && t.month === m && t.itemId === old.id)) items.push(old)
      months[m] = { ...plan, items }
    }
  }
  return { ...data, months, settings: { ...settings, updatedAt: now.toISOString() } }
}

export function newPlanItem(kind: PlanItem['kind'], name: string, amount: Cents): PlanItem {
  return { id: uid(), name, kind, amount, dueDay: null, active: true, aliases: [name.toLowerCase()] }
}
