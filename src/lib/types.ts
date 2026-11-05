import type { Cents } from './money'
import type { MonthKey } from './dates'

/** Soort post in het maandplan.
 *  bill    = vaste rekening die je afvinkt als betaald
 *  budget  = maandbudget (brandstof, kapper) waarop je werkelijke uitgaven boekt
 *  income  = inkomen
 *  savings = overboeking naar spaarrekening
 *  reserve = overboeking naar autoreserve */
export type ItemKind = 'income' | 'bill' | 'budget' | 'savings' | 'reserve'

export interface PlanItem {
  id: string
  name: string
  kind: ItemKind
  amount: Cents
  /** Dag van de maand waarop de post meestal valt. null = onbekend (we verzinnen geen datums). */
  dueDay: number | null
  active: boolean
  /** Extra woorden waarop de assistent deze post herkent. */
  aliases: string[]
}

/** Momentopname van een post zoals die voor één specifieke maand gold. */
export interface MonthItem {
  id: string
  name: string
  kind: ItemKind
  amount: Cents
  dueDay: number | null
}

export interface MonthPlan {
  month: MonthKey
  createdAt: string
  items: MonthItem[]
  /** Budgetposten die je voor deze maand handmatig hebt afgesloten. */
  closedBudgets: string[]
  note?: string
}

export type TxType =
  | 'income'              // inkomen ontvangen
  | 'expense'             // uitgave van je lopende rekening (rekening, budget of vrije uitgave)
  | 'savings_deposit'     // naar spaarrekening
  | 'savings_withdrawal'  // van spaarrekening af
  | 'savings_opening'     // beginsaldo spaarrekening
  | 'reserve_deposit'     // naar autoreserve
  | 'reserve_expense'     // onderhoud betaald uit autoreserve
  | 'reserve_opening'     // beginsaldo autoreserve

export interface Transaction {
  id: string
  type: TxType
  amount: Cents
  /** Datum van de werkelijke betaling (yyyy-mm-dd). */
  date: string
  /** Boekmaand: aan welke maand in het overzicht deze transactie telt. */
  month: MonthKey
  /** Koppeling aan een post in het maandplan; maximaal één transactie per afvinkbare post per maand. */
  itemId?: string
  category: string
  note: string
  source: 'checklist' | 'handmatig' | 'assistent' | 'import'
  createdAt: string
  updatedAt?: string
  /** Verwijderd = in de prullenbak; telt nergens meer mee maar is herstelbaar. */
  deletedAt?: string
  /** Eerdere versies na een correctie. */
  history?: { at: string; amount: Cents; date: string; note: string }[]
}

export type ReminderKind = 'salary' | 'savings' | 'bills' | 'outstanding' | 'weekly' | 'monthly'

export interface Reminder {
  id: string
  kind: ReminderKind
  label: string
  enabled: boolean
  /** Dag van de maand (maandelijks). null = nog niet ingesteld. */
  day: number | null
  /** Weekdag 0-6 (alleen wekelijkse review). */
  weekday: number | null
  /** "09:00" */
  time: string
  /** Rekeningen: aantal dagen van tevoren herinneren. */
  daysBefore: number
}

export interface Settings {
  version: 1
  startMonth: MonthKey
  items: PlanItem[]
  goal: { target: Cents; stretch: Cents; targetDate: string }
  milestones: Cents[]
  reminders: Reminder[]
  notificationsEnabled: boolean
  updatedAt: string
  /** Eenmalige data-updates die al zijn toegepast. */
  migrations?: string[]
  /** false = het instelscherm moet nog worden doorlopen. Ontbreekt bij oudere gegevens (= al ingesteld). */
  setupDone?: boolean
}

export interface AppData {
  settings: Settings
  months: Record<MonthKey, MonthPlan>
  transactions: Transaction[]
  /** Meldingen die al getoond zijn (sleutel = reminder-id + datum), zodat je niet twee keer gestoord wordt. */
  dismissed: string[]
}
