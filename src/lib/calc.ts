import type { AppData, MonthItem, MonthPlan, Transaction, PlanItem } from './types'
import type { Cents } from './money'
import { sum } from './money'
import { addMonths, currentMonth, dateInMonth, daysUntil, monthOf, monthRange, monthsBetween, type MonthKey } from './dates'

export function liveTx(data: AppData): Transaction[] {
  return data.transactions.filter((t) => !t.deletedAt)
}
export function txInMonth(data: AppData, m: MonthKey): Transaction[] {
  return liveTx(data).filter((t) => t.month === m)
}

export function toMonthItem(p: PlanItem): MonthItem {
  return { id: p.id, name: p.name, kind: p.kind, amount: p.amount, dueDay: p.dueDay }
}

/** Het plan voor een maand. Een maand waarin al iets is vastgelegd heeft een vaste momentopname,
 *  zodat latere wijzigingen in Instellingen de geschiedenis niet herschrijven.
 *  Toekomstige maanden volgen de actuele instellingen. */
export function planForMonth(data: AppData, m: MonthKey): MonthPlan {
  const existing = data.months[m]
  if (existing) return existing
  return {
    month: m,
    createdAt: '',
    items: data.settings.items.filter((i) => i.active).map(toMonthItem),
    closedBudgets: [],
  }
}

export interface PlanTotals {
  income: Cents
  fixed: Cents
  bills: Cents
  budgets: Cents
  savings: Cents
  reserve: Cents
  available: Cents
}

export function planTotals(items: Pick<MonthItem, 'kind' | 'amount'>[]): PlanTotals {
  const by = (k: MonthItem['kind']) => sum(items.filter((i) => i.kind === k).map((i) => i.amount))
  const income = by('income')
  const bills = by('bill')
  const budgets = by('budget')
  const fixed = bills + budgets
  const savings = by('savings')
  const reserve = by('reserve')
  return { income, fixed, bills, budgets, savings, reserve, available: income - fixed - savings - reserve }
}

/** Bij welke transactietype hoort een afvinkbare post. */
export function txTypeForKind(kind: MonthItem['kind']): Transaction['type'] {
  switch (kind) {
    case 'income': return 'income'
    case 'savings': return 'savings_deposit'
    case 'reserve': return 'reserve_deposit'
    default: return 'expense'
  }
}

export interface ItemStatus {
  item: MonthItem
  /** Afvinkbare posten: de gekoppelde transactie (maximaal één). */
  tx?: Transaction
  done: boolean
  /** Budgetposten: werkelijk besteed en wat er nog over is. */
  spent: Cents
  left: Cents
  overrun: Cents
}

export interface MonthSummary {
  month: MonthKey
  plan: MonthPlan
  planned: PlanTotals
  items: ItemStatus[]
  actualIncome: Cents
  paidBills: Cents
  budgetSpent: Cents
  freeSpent: Cents
  /** Alle uitgaven van je lopende rekening deze maand (rekeningen + budgetten + vrij). */
  totalExpenses: Cents
  savingsIn: Cents
  savingsOut: Cents
  savingsNet: Cents
  reserveIn: Cents
  reserveSpent: Cents
  overruns: Cents
  /** Wat je deze maand nog vrij kunt uitgeven. */
  spendingLeft: Cents
  /** Nog niet afgevinkte verplichtingen (rekeningen + spaar- en reserveoverboeking). */
  outstanding: Cents
  outstandingItems: ItemStatus[]
  checkableCount: number
  checkedCount: number
}

export function monthSummary(data: AppData, m: MonthKey): MonthSummary {
  const plan = planForMonth(data, m)
  const txs = txInMonth(data, m)
  const planIds = new Set(plan.items.map((i) => i.id))

  const items: ItemStatus[] = plan.items.map((item) => {
    if (item.kind === 'budget') {
      const spent = sum(txs.filter((t) => t.type === 'expense' && t.itemId === item.id).map((t) => t.amount))
      const closed = plan.closedBudgets.includes(item.id)
      return { item, done: closed, spent, left: Math.max(0, item.amount - spent), overrun: Math.max(0, spent - item.amount) }
    }
    const tx = txs.find((t) => t.itemId === item.id && t.type === txTypeForKind(item.kind))
    const spent = tx ? tx.amount : 0
    const overrun = item.kind === 'bill' && tx ? Math.max(0, tx.amount - item.amount) : 0
    return { item, tx, done: !!tx, spent, left: tx ? 0 : item.amount, overrun }
  })

  const of = (type: Transaction['type']) => txs.filter((t) => t.type === type)
  const expenses = of('expense')
  const billIds = new Set(plan.items.filter((i) => i.kind === 'bill').map((i) => i.id))
  const budgetIds = new Set(plan.items.filter((i) => i.kind === 'budget').map((i) => i.id))

  const paidBills = sum(expenses.filter((t) => t.itemId && billIds.has(t.itemId)).map((t) => t.amount))
  const budgetSpent = sum(expenses.filter((t) => t.itemId && budgetIds.has(t.itemId)).map((t) => t.amount))
  const freeSpent = sum(expenses.filter((t) => !t.itemId || !planIds.has(t.itemId)).map((t) => t.amount))
  const overruns = sum(items.map((s) => s.overrun))
  const planned = planTotals(plan.items)

  const savingsIn = sum(of('savings_deposit').map((t) => t.amount))
  const savingsOut = sum(of('savings_withdrawal').map((t) => t.amount))
  const outstandingItems = items.filter((s) => !s.done && (s.item.kind === 'bill' || s.item.kind === 'savings' || s.item.kind === 'reserve'))
  const checkable = items

  return {
    month: m,
    plan,
    planned,
    items,
    actualIncome: sum(of('income').map((t) => t.amount)),
    paidBills,
    budgetSpent,
    freeSpent,
    totalExpenses: paidBills + budgetSpent + freeSpent,
    savingsIn,
    savingsOut,
    savingsNet: savingsIn - savingsOut,
    reserveIn: sum(of('reserve_deposit').map((t) => t.amount)),
    reserveSpent: sum(of('reserve_expense').map((t) => t.amount)),
    overruns,
    spendingLeft: planned.available - freeSpent - overruns,
    outstanding: sum(outstandingItems.map((s) => s.item.amount)),
    outstandingItems,
    checkableCount: checkable.length,
    checkedCount: checkable.filter((s) => s.done).length,
  }
}

export interface SavingsStats {
  balance: Cents
  opening: Cents
  totalDeposited: Cents
  totalWithdrawn: Cents
  yearSaved: Cents
  target: Cents
  stretch: Cents
  percent: number
  stretchPercent: number
  remaining: Cents
  monthsToGo: number
  requiredMonthly: Cents
  /** null = nog te weinig echte gegevens om te voorspellen. */
  projection: Cents | null
  averageMonthly: Cents | null
  basedOnMonths: number
  milestones: { amount: Cents; reached: boolean; reachedOn?: string }[]
  perMonth: { month: MonthKey; net: Cents; balance: Cents }[]
}

/** Spaarstatistieken, uitsluitend berekend uit werkelijk vastgelegde transacties. */
export function savingsStats(data: AppData, now = new Date()): SavingsStats {
  const txs = liveTx(data)
  const { target, stretch, targetDate } = data.settings.goal
  const cur = currentMonth(now)
  const year = cur.slice(0, 4)
  const opening = sum(txs.filter((t) => t.type === 'savings_opening').map((t) => t.amount))
  const deposits = txs.filter((t) => t.type === 'savings_deposit')
  const withdrawals = txs.filter((t) => t.type === 'savings_withdrawal')
  const totalDeposited = sum(deposits.map((t) => t.amount))
  const totalWithdrawn = sum(withdrawals.map((t) => t.amount))
  const balance = opening + totalDeposited - totalWithdrawn
  const yearSaved = sum(deposits.filter((t) => t.month.startsWith(year)).map((t) => t.amount)) - sum(withdrawals.filter((t) => t.month.startsWith(year)).map((t) => t.amount))

  // Per maand
  const months = new Set<MonthKey>([data.settings.startMonth, cur])
  txs.forEach((t) => { if (t.type.startsWith('savings')) months.add(t.month) })
  const sorted = [...months].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1] > cur ? sorted[sorted.length - 1] : cur
  let running = 0
  const perMonth = monthRange(first, last).map((m) => {
    const inM = txs.filter((t) => t.month === m)
    const net = sum(inM.filter((t) => t.type === 'savings_deposit').map((t) => t.amount)) - sum(inM.filter((t) => t.type === 'savings_withdrawal').map((t) => t.amount))
    running += net + sum(inM.filter((t) => t.type === 'savings_opening').map((t) => t.amount))
    return { month: m, net, balance: running }
  })

  // Mijlpalen: bereikt zodra het werkelijke saldo het bedrag haalt. Datum = eerste dag waarop het lopende saldo erboven kwam.
  const chrono = txs.filter((t) => t.type.startsWith('savings')).sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt))
  const reachedOn: Record<number, string> = {}
  let bal = 0
  for (const t of chrono) {
    bal += t.type === 'savings_withdrawal' ? -t.amount : t.amount
    for (const ms of data.settings.milestones) if (bal >= ms && !reachedOn[ms]) reachedOn[ms] = t.date
  }
  const milestones = [...data.settings.milestones].sort((a, b) => a - b).map((amount) => ({
    amount,
    reached: balance >= amount,
    reachedOn: balance >= amount ? reachedOn[amount] : undefined,
  }))

  const targetMonth = monthOf(targetDate)
  const depositedThisMonth = deposits.some((t) => t.month === cur)
  const monthsToGo = Math.max(0, monthsBetween(cur, targetMonth) + (depositedThisMonth ? 0 : 1))
  const remaining = Math.max(0, target - balance)
  const requiredMonthly = remaining === 0 ? 0 : monthsToGo > 0 ? Math.ceil(remaining / monthsToGo) : remaining

  // Voorspelling: gemiddelde netto inleg over afgesloten maanden vanaf de startmaand (of de lopende maand als er nog geen afgesloten maanden zijn).
  const start = data.settings.startMonth
  const closed = perMonth.filter((p) => p.month >= start && p.month < cur)
  let averageMonthly: Cents | null = null
  let basedOnMonths = 0
  if (closed.length > 0) {
    averageMonthly = Math.round(sum(closed.map((p) => p.net)) / closed.length)
    basedOnMonths = closed.length
  } else {
    const curNet = perMonth.find((p) => p.month === cur)?.net ?? 0
    if (curNet !== 0) { averageMonthly = curNet; basedOnMonths = 1 }
  }
  let projection: Cents | null = null
  if (averageMonthly !== null) {
    const futureMonths = Math.max(0, monthsBetween(cur, targetMonth)) + (depositedThisMonth ? 0 : 1)
    projection = balance + averageMonthly * futureMonths
  }

  return {
    balance, opening, totalDeposited, totalWithdrawn, yearSaved, target, stretch,
    percent: target > 0 ? Math.min(100, (balance / target) * 100) : 0,
    stretchPercent: stretch > 0 ? Math.min(100, (balance / stretch) * 100) : 0,
    remaining, monthsToGo, requiredMonthly, projection, averageMonthly, basedOnMonths, milestones, perMonth,
  }
}

export interface ReserveStats {
  balance: Cents
  opening: Cents
  deposited: Cents
  spent: Cents
  monthlyTarget: Cents
  expenses: Transaction[]
  deposits: Transaction[]
}

export function reserveStats(data: AppData): ReserveStats {
  const txs = liveTx(data)
  const opening = sum(txs.filter((t) => t.type === 'reserve_opening').map((t) => t.amount))
  const deposits = txs.filter((t) => t.type === 'reserve_deposit')
  const expenses = txs.filter((t) => t.type === 'reserve_expense')
  const deposited = sum(deposits.map((t) => t.amount))
  const spent = sum(expenses.map((t) => t.amount))
  const monthlyTarget = data.settings.items.find((i) => i.kind === 'reserve')?.amount ?? 0
  const byDate = (a: Transaction, b: Transaction) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)
  return { balance: opening + deposited - spent, opening, deposited, spent, monthlyTarget, expenses: expenses.sort(byDate), deposits: deposits.sort(byDate) }
}

/** Komende betalingen: openstaande posten van deze maand, plus posten van volgende maand binnen `days` dagen.
 *  Posten zonder bekende datum krijgen date = null (we verzinnen geen vervaldatums). */
export function upcoming(data: AppData, now = new Date(), days = 14) {
  const cur = currentMonth(now)
  const res: { month: MonthKey; status: ItemStatus; date: string | null; inDays: number | null }[] = []
  for (const m of [cur, addMonths(cur, 1)]) {
    for (const st of monthSummary(data, m).outstandingItems) {
      if (st.item.dueDay == null) { if (m === cur) res.push({ month: m, status: st, date: null, inDays: null }); continue }
      const date = dateInMonth(m, st.item.dueDay)
      const inDays = daysUntil(date, now)
      if (m === cur || inDays <= days) res.push({ month: m, status: st, date, inDays })
    }
  }
  return res.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
}
