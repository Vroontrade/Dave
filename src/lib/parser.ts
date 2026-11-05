import type { AppData, TxType } from './types'
import type { Cents } from './money'
import { euro, parseAmount } from './money'
import { monthSummary, planForMonth, reserveStats, savingsStats } from './calc'
import { findLinked, TX_LABEL } from './actions'
import { currentMonth, monthLabel, monthOf, pad, todayISO } from './dates'

export interface DraftAction {
  kind: 'action'
  type: TxType
  amount: Cents | null
  date: string
  itemId?: string
  category: string
  note: string
  title: string
  explanation: string
  /** Voor auto-uitgaven: mag de gebruiker kiezen tussen autoreserve en lopend budget. */
  canSwitchToBudget?: boolean
}
export interface Answer { kind: 'answer'; text: string; lines?: [string, string][] }
export interface Unknown { kind: 'unknown'; text: string }
export type ParseResult = DraftAction | Answer | Unknown

const MONTH_WORDS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/\s+/g, ' ').trim()
}

/** Haalt een bedrag uit de zin. Voorkeur voor getallen met € of "euro"; negeert dagnummers in datums. */
export function extractAmount(text: string): Cents | null {
  const withSymbol = text.match(/€\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:euro|eur)\b/)
  if (withSymbol) {
    const v = parseAmount((withSymbol[1] ?? withSymbol[2]).replace(/[.,]$/, ''))
    if (v != null) return v
  }
  const re = /(\d[\d.,]*)(\s*[a-z]+)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const after = (m[2] ?? '').trim()
    if (MONTH_WORDS.includes(after) || MONTH_SHORT.includes(after)) continue
    if (/^\d{1,2}[-/]\d{1,2}/.test(text.slice(m.index))) continue
    const v = parseAmount(m[1].replace(/[.,]$/, ''))
    if (v != null) return v
  }
  return null
}

export function extractDate(text: string, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (/\beergisteren\b/.test(text)) { d.setDate(d.getDate() - 2); return todayISO(d) }
  if (/\bgisteren\b/.test(text)) { d.setDate(d.getDate() - 1); return todayISO(d) }
  const named = text.match(/\bop (\d{1,2}) ([a-z]+)/)
  if (named) {
    let mi = MONTH_WORDS.indexOf(named[2])
    if (mi < 0) mi = MONTH_SHORT.indexOf(named[2])
    if (mi >= 0) {
      let y = now.getFullYear()
      if (mi > now.getMonth() + 1) y -= 1 // "op 28 december" in januari = vorig jaar
      const day = Number(named[1])
      const cand = `${y}-${pad(mi + 1)}-${pad(day)}`
      if (!isNaN(new Date(cand).getTime()) && day >= 1 && day <= 31) return cand
    }
  }
  const numeric = text.match(/\bop (\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/)
  if (numeric) {
    const day = Number(numeric[1]), mo = Number(numeric[2])
    let y = numeric[3] ? Number(numeric[3]) : now.getFullYear()
    if (y < 100) y += 2000
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return `${y}-${pad(mo)}-${pad(day)}`
  }
  return todayISO(now)
}

function hasWord(text: string, word: string) {
  const w = normalize(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(text)
}

/** Vindt de post waarvan een alias het langst overeenkomt (zodat "zorgverzekering" wint van "verzekering"). */
function matchItem(data: AppData, text: string, kinds: string[]) {
  const items = planForMonth(data, currentMonth()).items
  const plan = data.settings.items
  let best: { id: string; name: string; len: number } | null = null
  for (const p of plan) {
    if (!kinds.includes(p.kind)) continue
    const inMonth = items.find((i) => i.id === p.id)
    if (!inMonth && !p.active) continue
    for (const a of [p.name, ...p.aliases]) {
      if (a && hasWord(text, a) && (!best || a.length > best.len)) best = { id: p.id, name: p.name, len: a.length }
    }
  }
  return best
}

const Q_START = /^(hoeveel|wat|hoe|wanneer|welke|staat|sta|heb ik|ben ik|kan ik|liggen|lig ik|status|overzicht)\b/

export function parseCommand(input: string, data: AppData, now = new Date()): ParseResult {
  const raw = input.trim()
  const text = normalize(raw)
  if (!text) return { kind: 'unknown', text: 'Typ wat er gebeurde, bijvoorbeeld "Ik heb €45 getankt".' }
  const month = currentMonth(now)
  const amount = extractAmount(text)
  const date = extractDate(text, now)
  const txMonth = monthOf(date)
  const plan = planForMonth(data, txMonth)
  const planned = (id: string) => plan.items.find((i) => i.id === id)?.amount ?? data.settings.items.find((i) => i.id === id)?.amount ?? null
  const isQuestion = raw.endsWith('?') || Q_START.test(text)

  // ---------- Vragen ----------
  if (isQuestion) {
    const s = monthSummary(data, month)
    const sv = savingsStats(data, now)
    if (/autoreserve|autopot|\bauto\b|reserve/.test(text)) {
      const r = reserveStats(data)
      return { kind: 'answer', text: `Je autoreserve staat op ${euro(r.balance)}.`, lines: [['Ingelegd', euro(r.deposited)], ['Uitgegeven aan onderhoud', euro(r.spent)]] }
    }
    if (/uitgeven|besteden|over\b|budget|vrij|ruimte|nog te/.test(text)) {
      return {
        kind: 'answer',
        text: s.spendingLeft >= 0 ? `Je kunt in ${monthLabel(month, false)} nog ${euro(s.spendingLeft)} vrij uitgeven.` : `Je zit in ${monthLabel(month, false)} ${euro(-s.spendingLeft)} boven je vrije budget.`,
        lines: [
          ['Vrij budget volgens plan', euro(s.planned.available)],
          ['Vrije uitgaven', euro(s.freeSpent)],
          ['Overschrijding van budgetposten', euro(s.overruns)],
          ...s.items.filter((i) => i.item.kind === 'budget').map((i) => [`${i.item.name} nog over`, euro(i.left)] as [string, string]),
        ],
      }
    }
    if (/open|openstaand|nog betalen|moet ik nog|nog te betalen|achterstand/.test(text)) {
      const names = s.outstandingItems.map((i) => i.item.name).join(', ')
      return { kind: 'answer', text: s.outstanding > 0 ? `Er staat in ${monthLabel(month, false)} nog ${euro(s.outstanding)} open: ${names}.` : `Alles voor ${monthLabel(month, false)} is afgevinkt.` }
    }
    if (/gespaard|spaar|sparen|doel|spaargeld/.test(text)) {
      const lines: [string, string][] = [
        ['Spaarsaldo', euro(sv.balance)],
        [`Netto gespaard in ${month.slice(0, 4)}`, euro(sv.yearSaved)],
        ['Spaardoel', `${euro(sv.target, { whole: true })} (${sv.percent.toFixed(1).replace('.', ',')}%)`],
        ['Nog nodig per maand', euro(sv.requiredMonthly)],
      ]
      if (/jaar/.test(text)) return { kind: 'answer', text: `Je hebt in ${month.slice(0, 4)} netto ${euro(sv.yearSaved)} gespaard.`, lines }
      return { kind: 'answer', text: `Je spaarsaldo is ${euro(sv.balance)}. Dat is ${sv.percent.toFixed(1).replace('.', ',')}% van je doel van ${euro(sv.target, { whole: true })}.`, lines }
    }
    if (/salaris|inkomen|loon/.test(text)) {
      return { kind: 'answer', text: s.actualIncome > 0 ? `In ${monthLabel(month, false)} is ${euro(s.actualIncome)} inkomen geregistreerd.` : `Je salaris van ${monthLabel(month, false)} is nog niet geregistreerd.` }
    }
    return {
      kind: 'answer',
      text: `Stand van ${monthLabel(month)}:`,
      lines: [['Nog vrij te besteden', euro(s.spendingLeft)], ['Nog open', euro(s.outstanding)], ['Spaarsaldo', euro(sv.balance)], ['Afgevinkt', `${s.checkedCount} van ${s.checkableCount}`]],
    }
  }

  const draft = (d: Omit<DraftAction, 'kind' | 'date'>): DraftAction => ({ kind: 'action', date, ...d })

  // ---------- Salaris ----------
  if (/salaris|\bloon\b/.test(text)) {
    if (findLinked(data, txMonth, 'income', 'income')) {
      return draft({ type: 'income', amount, category: 'Overig inkomen', note: raw, title: 'Extra inkomen', explanation: `Je salaris van ${monthLabel(txMonth, false)} staat al geregistreerd. Dit wordt als extra inkomen opgeslagen.` })
    }
    return draft({ type: 'income', amount: amount ?? planned('income'), itemId: 'income', category: 'Salaris', note: 'Salaris', title: 'Salaris ontvangen', explanation: `Vinkt "Salaris" af in ${monthLabel(txMonth)}.` })
  }

  // ---------- Opname van spaarrekening ----------
  if (/spaar|gespaard|sparen/.test(text) && /opgenomen|gehaald|afgehaald|opname|haal|teruggezet|teruggeboekt/.test(text)) {
    return draft({ type: 'savings_withdrawal', amount, category: 'Spaaropname', note: raw, title: 'Opname van spaarrekening', explanation: 'Verlaagt je spaarsaldo. Je maandchecklist verandert niet.' })
  }

  // ---------- Autoreserve storten ----------
  if (/autoreserve|autopot|reserve/.test(text) && /gestort|apart|overgemaakt|toegevoegd|ingelegd|gezet|bijgestort|erbij/.test(text)) {
    const linked = findLinked(data, txMonth, 'reserve', 'reserve_deposit')
    return draft({
      type: 'reserve_deposit', amount: amount ?? planned('reserve'), itemId: linked ? undefined : 'reserve', category: 'Autoreserve', note: linked ? raw : 'Autoreserve',
      title: 'Storting autoreserve', explanation: linked ? 'De maandelijkse storting staat al afgevinkt. Dit wordt een extra storting.' : `Vinkt "Autoreserve" af in ${monthLabel(txMonth)}.`,
    })
  }

  // ---------- Sparen ----------
  if (/gespaard|spaarrekening|opzij|apart gezet|naar sparen|spaarpot|ingelegd|gestort/.test(text) && !/auto/.test(text)) {
    const linked = findLinked(data, txMonth, 'savings', 'savings_deposit')
    return draft({
      type: 'savings_deposit', amount: amount ?? (linked ? null : planned('savings')), itemId: linked ? undefined : 'savings', category: 'Sparen', note: linked ? raw : 'Spaaroverboeking',
      title: 'Spaarstorting', explanation: linked ? 'De maandelijkse spaaroverboeking staat al afgevinkt. Dit wordt een extra storting.' : `Verhoogt je spaarsaldo en vinkt "Spaaroverboeking" af in ${monthLabel(txMonth)}.`,
    })
  }

  // ---------- Budgetposten (tanken, kapper) ----------
  const budget = matchItem(data, text, ['budget'])
  if (budget) {
    return draft({ type: 'expense', amount, itemId: budget.id, category: budget.name, note: raw, title: `Uitgave ${budget.name.toLowerCase()}`, explanation: `Wordt afgeboekt van je budget voor ${budget.name.toLowerCase()} in ${monthLabel(txMonth)}.` })
  }

  // ---------- Auto-onderhoud ----------
  if (/\bauto\b|apk|garage|onderhoud|banden|\bband\b|reparatie|remmen|\bolie|schade|accu|ruitenwisser|wasstraat/.test(text)) {
    return draft({ type: 'reserve_expense', amount, category: 'Auto-onderhoud', note: raw, title: 'Auto-onderhoud', explanation: 'Wordt betaald uit je autoreserve en telt niet mee in je vrije budget.', canSwitchToBudget: true })
  }

  // ---------- Vaste rekeningen ----------
  const bill = matchItem(data, text, ['bill'])
  if (bill) {
    if (findLinked(data, txMonth, bill.id, 'expense')) {
      return { kind: 'unknown', text: `${bill.name} staat in ${monthLabel(txMonth, false)} al als betaald. Wil je het bedrag corrigeren? Open dan de betaling in Maandoverzicht of Transacties.` }
    }
    return draft({ type: 'expense', amount: amount ?? planned(bill.id), itemId: bill.id, category: bill.name, note: bill.name, title: `${bill.name} betaald`, explanation: `Vinkt "${bill.name}" af in ${monthLabel(txMonth)}.` })
  }

  // ---------- Overig inkomen ----------
  if (/ontvangen|gekregen|teruggave|terugbetaald|bijverdiend|binnen/.test(text) && amount) {
    return draft({ type: 'income', amount, category: 'Overig inkomen', note: raw, title: 'Inkomen ontvangen', explanation: 'Wordt opgeslagen als extra inkomen. Je vrije budget blijft gebaseerd op je plan.' })
  }

  // ---------- Vrije uitgave ----------
  if (/uitgegeven|betaald|gekocht|gekost|besteed|kostte|uitgave|kwijt|gepind|afgerekend|boodschappen|eten|gegeten/.test(text) || amount) {
    return draft({ type: 'expense', amount, category: guessCategory(text), note: raw, title: 'Vrije uitgave', explanation: 'Wordt afgetrokken van je vrij te besteden budget.' })
  }

  return { kind: 'unknown', text: 'Dat herken ik niet. Probeer bijvoorbeeld "Ik heb €45 getankt", "Mijn zorgverzekering is betaald" of "Hoeveel kan ik nog uitgeven?".' }
}

function guessCategory(t: string): string {
  if (/boodschap|supermarkt|albert heijn|\bah\b|jumbo|lidl|aldi|plus\b/.test(t)) return 'Boodschappen'
  if (/eten|restaurant|lunch|diner|koffie|bezorg|thuisbezorgd|uber eats/.test(t)) return 'Uit eten'
  if (/kleding|schoenen|kleren/.test(t)) return 'Kleding'
  if (/cadeau|kado|verjaardag/.test(t)) return 'Cadeaus'
  if (/sport|gym|fitness/.test(t)) return 'Sport'
  if (/parkeren|ov\b|trein|bus|taxi/.test(t)) return 'Vervoer'
  if (/uitje|bios|film|concert|feest|stappen/.test(t)) return 'Uitgaan'
  return 'Overig'
}

export function describeType(t: TxType) { return TX_LABEL[t] }
