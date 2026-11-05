import { describe, it, expect, beforeEach } from 'vitest'
import { emptyData, item, suggestAliases } from './defaults'
import { monthSummary, planTotals, savingsStats, reserveStats, planForMonth } from './calc'
import { addTransaction, toggleItem, deleteTransaction, restoreTransaction, updateTransaction, updateSettings, ActionError } from './actions'
import { parseAmount, euro } from './money'
import { parseCommand } from './parser'
import { saveLocal, loadLocal, exportJSON, importJSON, migrate } from './storage'
import { transactionsCSV, remindersICS } from './exporters'
import { monthRange } from './dates'
import type { AppData } from './types'

/* Neutrale voorbeeldbedragen (niet de echte bedragen van de gebruiker; die staan nooit in de code). */
const NOW = new Date(2027, 0, 15, 10, 0) // 15 januari 2027
const fresh = (): AppData => {
  const d = emptyData(NOW)
  const it = (id: string, name: string, kind: Parameters<typeof item>[2], amount: number, dueDay: number | null = null) => item(id, name, kind, amount, suggestAliases(name), dueDay)
  d.settings.items = [
    it('income', 'Salaris', 'income', 250000, 25),
    it('phone', 'Telefoon', 'bill', 4000),
    it('tax', 'Belasting', 'bill', 6000),
    it('health', 'Zorgverzekering', 'bill', 14000),
    it('subs', 'Abonnementen', 'bill', 2500),
    it('carins', 'Autoverzekering', 'bill', 5000),
    it('fuel', 'Brandstof', 'budget', 20000),
    it('hair', 'Kapper', 'budget', 4000),
    it('savings', 'Spaaroverboeking', 'savings', 60000),
    it('reserve', 'Autoreserve', 'reserve', 10000),
  ]
  d.settings.goal = { target: 1000000, stretch: 1500000, targetDate: '2027-12-31' }
  d.settings.setupDone = true
  return d
}
// vaste lasten 55.500 · vrij budget 2.500 − 555 − 600 − 100 = 1.245
const FIXED = 55500
const AVAILABLE = 124500

describe('Plan en vaste lasten', () => {
  it('vaste lasten worden opgeteld uit de posten', () => {
    expect(planTotals(planForMonth(fresh(), '2027-01').items).fixed).toBe(FIXED)
    expect(euro(FIXED)).toBe('€ 555,00')
  })
  it('vrij budget = inkomen − vaste lasten − sparen − reserve', () => {
    const t = planTotals(planForMonth(fresh(), '2027-01').items)
    expect(t.income).toBe(250000)
    expect(t.savings).toBe(60000)
    expect(t.reserve).toBe(10000)
    expect(t.available).toBe(AVAILABLE)
  })
  it('decimalen kloppen tot op de cent', () => {
    expect(planTotals([{ kind: 'income', amount: 240000 }, { kind: 'bill', amount: 2499 }, { kind: 'bill', amount: 7451 }]).available).toBe(230050)
  })
  it('wijzigingen in instellingen werken door in de berekening', () => {
    const d = fresh()
    const s = { ...d.settings, items: d.settings.items.map((i) => (i.id === 'phone' ? { ...i, amount: 5000 } : i)) }
    const d2 = updateSettings(d, s)
    expect(planTotals(planForMonth(d2, '2027-01').items).fixed).toBe(FIXED + 1000)
    expect(planTotals(planForMonth(d2, '2027-01').items).available).toBe(AVAILABLE - 1000)
  })
})

describe('Sparen en autoreserve over een jaar', () => {
  let d: AppData
  beforeEach(() => {
    d = fresh()
    for (const m of monthRange('2027-01', '2027-12')) {
      d = toggleItem(d, m, 'savings', { date: `${m}-25` }, NOW).data
      d = toggleItem(d, m, 'reserve', { date: `${m}-25` }, NOW).data
    }
  })
  it('twaalf spaarstortingen worden correct opgeteld', () => {
    const s = savingsStats(d, new Date(2027, 11, 31))
    expect(s.balance).toBe(720000)
    expect(s.totalDeposited).toBe(720000)
    expect(euro(s.balance)).toBe('€ 7.200,00')
  })
  it('twaalf autoreserve-stortingen worden correct opgeteld', () => {
    expect(reserveStats(d).balance).toBe(120000)
  })
  it('mijlpalen worden bereikt op basis van werkelijk saldo', () => {
    const s = savingsStats(d, new Date(2027, 11, 31))
    expect(s.milestones.filter((m) => m.reached).map((m) => m.amount)).toEqual([50000, 100000, 150000, 200000, 300000, 500000])
    expect(s.milestones.find((m) => m.amount === 100000)?.reachedOn).toBe('2027-02-25')
  })
  it('opname verlaagt het saldo; geplande stortingen tellen niet mee', () => {
    d = addTransaction(d, { type: 'savings_withdrawal', amount: 20000, date: '2027-12-30' }, NOW).data
    const s = savingsStats(d, new Date(2027, 11, 31))
    expect(s.balance).toBe(700000)
    expect(s.totalWithdrawn).toBe(20000)
    expect(savingsStats(fresh(), NOW).balance).toBe(0)
    expect(savingsStats(fresh(), NOW).projection).toBeNull()
  })
  it('autoreparatie uit reserve gaat niet van het vrije budget af', () => {
    d = addTransaction(d, { type: 'reserve_expense', amount: 50000, date: '2027-06-10', note: 'Autoreparatie' }, NOW).data
    expect(reserveStats(d).balance).toBe(70000)
    expect(monthSummary(d, '2027-06').spendingLeft).toBe(AVAILABLE)
  })
})

describe('Nooit dubbel aftrekken', () => {
  it('een rekening twee keer afvinken via addTransaction faalt', () => {
    let d = fresh()
    d = toggleItem(d, '2027-01', 'health', { date: '2027-01-02' }, NOW).data
    expect(() => addTransaction(d, { type: 'expense', amount: 14000, date: '2027-01-03', itemId: 'health' }, NOW)).toThrow(ActionError)
    const s = monthSummary(d, '2027-01')
    expect(s.paidBills).toBe(14000)
    expect(s.outstanding).toBe(31500 - 14000 + 60000 + 10000) // rekeningen excl. budgetten + sparen + reserve
  })
  it('uitvinken maakt ongedaan en herstellen is veilig', () => {
    let d = fresh()
    const r1 = toggleItem(d, '2027-01', 'phone', { date: '2027-01-05' }, NOW)
    d = r1.data
    expect(monthSummary(d, '2027-01').items.find((i) => i.item.id === 'phone')!.done).toBe(true)
    d = toggleItem(d, '2027-01', 'phone', { date: '2027-01-05' }, NOW).data
    expect(monthSummary(d, '2027-01').items.find((i) => i.item.id === 'phone')!.done).toBe(false)
    expect(monthSummary(d, '2027-01').paidBills).toBe(0)
    expect(d.transactions.find((t) => t.id === r1.tx!.id)!.deletedAt).toBeTruthy()
    d = toggleItem(d, '2027-01', 'phone', { date: '2027-01-06' }, NOW).data
    expect(() => restoreTransaction(d, r1.tx!.id)).toThrow(ActionError)
  })
  it('budgetuitgaven tellen één keer: binnen budget raakt vrij budget niet', () => {
    let d = fresh()
    d = addTransaction(d, { type: 'expense', amount: 4500, date: '2027-01-08', itemId: 'fuel' }, NOW).data
    const s = monthSummary(d, '2027-01')
    expect(s.items.find((i) => i.item.id === 'fuel')!.left).toBe(15500)
    expect(s.spendingLeft).toBe(AVAILABLE)
    expect(s.totalExpenses).toBe(4500)
    d = addTransaction(d, { type: 'expense', amount: 20000, date: '2027-01-20', itemId: 'fuel' }, NOW).data
    expect(monthSummary(d, '2027-01').spendingLeft).toBe(AVAILABLE - 4500)
  })
  it('vrije uitgave verlaagt het vrije budget', () => {
    const d = addTransaction(fresh(), { type: 'expense', amount: 2000, date: '2027-01-08' }, NOW).data
    expect(monthSummary(d, '2027-01').spendingLeft).toBe(AVAILABLE - 2000)
  })
  it('correctie bewaart historie', () => {
    let d = fresh()
    const r = toggleItem(d, '2027-01', 'subs', { date: '2027-01-02' }, NOW)
    d = updateTransaction(r.data, r.tx!.id, { amount: 2700 }, NOW)
    const t = d.transactions.find((x) => x.id === r.tx!.id)!
    expect(t.amount).toBe(2700)
    expect(t.history![0].amount).toBe(2500)
    expect(monthSummary(d, '2027-01').overruns).toBe(200)
  })
  it('verwijderde transactie telt nergens meer mee', () => {
    let d = fresh()
    const r = addTransaction(d, { type: 'savings_deposit', amount: 60000, date: '2027-01-25' }, NOW)
    d = deleteTransaction(r.data, r.tx.id, NOW)
    expect(savingsStats(d, NOW).balance).toBe(0)
  })
})

describe('Maandplan', () => {
  it('maand met gegevens behoudt eigen momentopname; toekomstige maand volgt instellingen', () => {
    let d = toggleItem(fresh(), '2027-01', 'phone', { date: '2027-01-05' }, NOW).data
    const s = { ...d.settings, items: d.settings.items.map((i) => (i.id === 'phone' ? { ...i, amount: 5000 } : i)) }
    d = updateSettings(d, s)
    expect(planForMonth(d, '2027-01').items.find((i) => i.id === 'phone')!.amount).toBe(4000)
    expect(planForMonth(d, '2027-02').items.find((i) => i.id === 'phone')!.amount).toBe(5000)
  })
  it('elke maand van het jaar heeft alle posten', () => {
    for (const m of monthRange('2027-01', '2027-12')) expect(monthSummary(fresh(), m).items.length).toBe(10)
  })
})

describe('Bedragen invoeren', () => {
  it.each([
    ['45', 4500], ['45,50', 4550], ['€ 45,5', 4550], ['1.250,50', 125050], ['1250', 125000], ['12.34', 1234], ['1.000', 100000], ['€650', 65000],
  ])('%s → %i cent', (input, cents) => expect(parseAmount(input)).toBe(cents))
  it.each(['', 'abc', '-5', '1,234', '12,3,4'])('%s is ongeldig', (input) => expect(parseAmount(input)).toBeNull())
})

describe('Nederlandse commando-parser', () => {
  const d = fresh()
  const p = (s: string) => parseCommand(s, d, NOW)
  it('salaris', () => { const r = p('Mijn salaris is binnen.'); expect(r.kind === 'action' && r.type === 'income' && r.amount === 250000 && r.itemId === 'income').toBe(true) })
  it('sparen', () => { const r = p('Ik heb €600 gespaard.'); expect(r.kind === 'action' && r.type === 'savings_deposit' && r.amount === 60000 && r.itemId === 'savings').toBe(true) })
  it('zorgverzekering', () => { const r = p('Mijn zorgverzekering van €140 is betaald.'); expect(r.kind === 'action' && r.type === 'expense' && r.itemId === 'health' && r.amount === 14000).toBe(true) })
  it('verzekering (niet zorg)', () => { const r = p('verzekering betaald'); expect(r.kind === 'action' && r.itemId === 'carins').toBe(true) })
  it('tanken', () => { const r = p('Ik heb €45 getankt.'); expect(r.kind === 'action' && r.type === 'expense' && r.itemId === 'fuel' && r.amount === 4500).toBe(true) })
  it('auto', () => { const r = p('Mijn auto heeft €250 gekost.'); expect(r.kind === 'action' && r.type === 'reserve_expense' && r.amount === 25000).toBe(true) })
  it('vraag budget', () => { const r = p('Hoeveel kan ik deze maand nog uitgeven?'); expect(r.kind === 'answer' && r.text.includes('1.245,00')).toBe(true) })
  it('vraag sparen', () => { const r = p('Hoeveel heb ik dit jaar gespaard?'); expect(r.kind === 'answer' && r.text.includes('2027')).toBe(true) })
  it('gisteren', () => { const r = p('gisteren 12,50 uitgegeven aan lunch'); expect(r.kind === 'action' && r.date === '2027-01-14' && r.amount === 1250 && r.category === 'Uit eten').toBe(true) })
  it('tweede spaarstorting is extra, niet gekoppeld', () => {
    const d2 = toggleItem(fresh(), '2027-01', 'savings', { date: '2027-01-02' }, NOW).data
    const r = parseCommand('Ik heb €100 gespaard', d2, NOW)
    expect(r.kind === 'action' && r.itemId === undefined && r.amount === 10000).toBe(true)
  })
  it('al betaalde rekening wordt niet nogmaals voorgesteld', () => {
    const d2 = toggleItem(fresh(), '2027-01', 'health', { date: '2027-01-02' }, NOW).data
    expect(parseCommand('zorgverzekering betaald', d2, NOW).kind).toBe('unknown')
  })
})

describe('Opslag en export', () => {
  it('gegevens blijven bewaard na herladen', () => {
    let d = toggleItem(fresh(), '2027-01', 'phone', { date: '2027-01-05' }, NOW).data
    d = addTransaction(d, { type: 'savings_deposit', amount: 60000, date: '2027-01-25', itemId: 'savings' }, NOW).data
    expect(saveLocal(d)).toBe(true)
    const loaded = loadLocal()!
    expect(loaded.transactions.length).toBe(2)
    expect(monthSummary(loaded, '2027-01').items.find((i) => i.item.id === 'phone')!.done).toBe(true)
    expect(savingsStats(loaded, NOW).balance).toBe(60000)
  })
  it('JSON-back-up terugzetten', () => {
    const d = addTransaction(fresh(), { type: 'expense', amount: 999, date: '2027-01-05' }, NOW).data
    expect(importJSON(exportJSON(d)).transactions[0].amount).toBe(999)
    expect(() => importJSON('{"x":1}')).toThrow()
  })
  it('CSV gebruikt Nederlands formaat', () => {
    const d = addTransaction(fresh(), { type: 'expense', amount: 4550, date: '2027-01-05', note: 'Tanken; Shell' }, NOW).data
    const csv = transactionsCSV(d)
    expect(csv).toContain('-45,50')
    expect(csv).toContain('"Tanken; Shell"')
  })
  it('agenda-export slaat onbekende datums over', () => {
    const d = fresh()
    d.settings.reminders = d.settings.reminders.map((r) => ({ ...r, enabled: true }))
    const { ics, skipped } = remindersICS(d, NOW)
    expect(ics).toContain('FREQ=WEEKLY;BYDAY=SU')
    expect(ics).toContain('BYMONTHDAY=28')
    expect(skipped.some((s) => s.includes('Telefoon'))).toBe(true)
  })
})

describe('Geen persoonlijke startgegevens', () => {
  it('nieuwe app begint zonder bedragen en toont het instelscherm', () => {
    const d = emptyData(NOW)
    expect(d.settings.setupDone).toBe(false)
    expect(d.settings.items.every((i) => i.amount === 0)).toBe(true)
    expect(d.settings.goal.target).toBe(0)
  })
  it('bestaande gegevens blijven intact en slaan het instelscherm over', () => {
    const old = fresh()
    delete old.settings.setupDone
    old.settings.items = old.settings.items.map((i) => (i.id === 'income' ? { ...i, dueDay: null } : i))
    old.settings.migrations = []
    const m = migrate(old)
    expect(m.settings.setupDone).toBe(true)
    expect(m.settings.items.find((i) => i.id === 'phone')!.amount).toBe(4000)
    expect(m.settings.items.find((i) => i.id === 'income')!.dueDay).toBe(25)
    m.settings.items = m.settings.items.map((i) => (i.id === 'income' ? { ...i, dueDay: 24 } : i))
    expect(migrate(m).settings.items.find((i) => i.id === 'income')!.dueDay).toBe(24)
  })
  it('herkenningswoorden voor zelf ingevoerde posten', () => {
    expect(suggestAliases('Brandstof')).toContain('getankt')
    expect(suggestAliases('Zorgverzekering Menzis')).toContain('zorgverzekering')
    expect(suggestAliases('Autoverzekering')).toContain('verzekering')
  })
})
