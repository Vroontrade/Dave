import type { PlanItem, Reminder, Settings, AppData } from './types'
import { currentMonth } from './dates'

export const ITEM_IDS = {
  income: 'income',
  savings: 'savings',
  reserve: 'reserve',
  fuel: 'fuel',
  hair: 'hair',
} as const

export function item(id: string, name: string, kind: PlanItem['kind'], amount: number, aliases: string[] = [], dueDay: number | null = null): PlanItem {
  return { id, name, kind, amount, dueDay, active: true, aliases }
}

/** Salarisdag voor gegevens van vóór het instelscherm (eenmalige update, zie storage.ts). */
export const LEGACY_SALARY_DAY = 25

/** Basisposten zonder bedragen. Alle persoonlijke bedragen vul je zelf in via het instelscherm;
 *  ze staan nooit in de code. */
export function defaultItems(): PlanItem[] {
  return [
    item('income', 'Salaris', 'income', 0, ['salaris', 'loon', 'inkomen', 'salaris is binnen']),
    item('savings', 'Spaaroverboeking', 'savings', 0, ['sparen', 'gespaard', 'spaarrekening']),
    item('reserve', 'Autoreserve', 'reserve', 0, ['autoreserve', 'autopot', 'auto reserve']),
  ]
}

/** Herkenningswoorden voor de assistent op basis van de naam van een post. */
export function suggestAliases(name: string): string[] {
  const n = name.toLowerCase().trim()
  const out = new Set<string>([n])
  n.split(/[\s\-/]+/).filter((w) => w.length >= 2).forEach((w) => out.add(w))
  const groups: [RegExp, string[]][] = [
    [/brandstof|benzine|diesel|tank/, ['brandstof', 'tanken', 'getankt', 'benzine', 'diesel', 'tankstation']],
    [/kapper|knip|barb/, ['kapper', 'knippen', 'barbier', 'barber']],
    [/zorg|cz|vgz|zilveren|menzis|ziektekost/, ['zorgverzekering', 'zorg', 'ziektekosten']],
    [/telefoon|mobiel|gsm/, ['telefoon', 'telefoonrekening', 'mobiel', 'gsm']],
    [/belasting/, ['belasting', 'belastingdienst', 'gemeentebelasting']],
    [/lenzen/, ['contactlenzen', 'lenzen']],
    [/microsoft|office/, ['microsoft', 'office', 'microsoft 365']],
    [/\bai\b|chatgpt|claude|openai/, ['ai', 'chatgpt', 'claude', 'openai']],
    [/huur|hypotheek/, ['huur', 'hypotheek', 'woonlasten']],
    [/boodschap/, ['boodschappen', 'supermarkt']],
    [/energie|stroom|gas/, ['energie', 'stroom', 'gas']],
    [/internet|wifi|tv/, ['internet', 'wifi', 'tv']],
  ]
  for (const [re, words] of groups) if (re.test(n)) words.forEach((w) => out.add(w))
  if (/verzekering/.test(n) && !/zorg/.test(n)) out.add('verzekering')
  return [...out]
}

export function defaultReminders(): Reminder[] {
  const r = (id: string, kind: Reminder['kind'], label: string, extra: Partial<Reminder> = {}): Reminder => ({
    id, kind, label, enabled: false, day: null, weekday: null, time: '09:00', daysBefore: 2, ...extra,
  })
  return [
    r('salary', 'salary', 'Salarisdag: controleer of je salaris binnen is'),
    r('savings', 'savings', 'Maak je spaarbedrag over naar je spaarrekening'),
    r('bills', 'bills', 'Rekening vervalt binnenkort'),
    r('outstanding', 'outstanding', 'Er staan nog betalingen open', { day: 25 }),
    r('weekly', 'weekly', 'Wekelijkse budgetcheck', { weekday: 0, time: '19:00' }),
    r('monthly', 'monthly', 'Maandelijkse financiële review', { day: 28, time: '19:00' }),
  ]
}

export const DEFAULT_MILESTONES = [50000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000, 1250000, 1500000]

export function defaultSettings(now = new Date()): Settings {
  return {
    version: 1,
    startMonth: currentMonth(now),
    items: defaultItems(),
    goal: { target: 0, stretch: 0, targetDate: `${now.getFullYear() + 1}-12-31` },
    milestones: [...DEFAULT_MILESTONES],
    reminders: defaultReminders(),
    notificationsEnabled: false,
    migrations: ['salary-day-25'],
    setupDone: false,
    updatedAt: now.toISOString(),
  }
}

export function emptyData(now = new Date()): AppData {
  return { settings: defaultSettings(now), months: {}, transactions: [], dismissed: [] }
}
