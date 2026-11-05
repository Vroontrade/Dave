// Alle bedragen worden intern opgeslagen als hele centen (integers) om afrondingsfouten te voorkomen.
export type Cents = number

const fmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt0 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })

export function euro(c: Cents, opts: { whole?: boolean } = {}): string {
  const v = c / 100
  return (opts.whole ? fmt0 : fmt).format(v).replace(/ /g, ' ')
}

export function euroSigned(c: Cents): string {
  if (c > 0) return '+' + euro(c)
  if (c < 0) return '−' + euro(-c)
  return euro(0)
}

/** Zet een bedrag zoals de gebruiker het typt om naar centen.
 *  Accepteert "1.250,50", "1250,5", "45", "45.50", "€ 45", "1 250". Geeft null bij ongeldige invoer. */
export function parseAmount(input: string): Cents | null {
  if (input == null) return null
  let s = String(input).trim().replace(/€|eur(o)?/gi, '').replace(/\s| /g, '')
  if (s.startsWith('-')) return null
  if (!s) return null
  if (!/^[\d.,]+$/.test(s)) return null
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // Nederlands: punt = duizendtal, komma = decimaal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    const parts = s.split(',')
    if (parts.length > 2) return null
    if (parts[1].length > 2) return null // komma is altijd een decimaalteken
    s = parts[0] + '.' + parts[1]
  } else if (hasDot) {
    const parts = s.split('.')
    const last = parts[parts.length - 1]
    if (parts.length === 2 && last.length <= 2) s = parts[0] + '.' + last
    else if (parts.slice(1).every((p) => p.length === 3)) s = parts.join('')
    else return null
  }
  if (s.endsWith('.')) s = s.slice(0, -1)
  const n = Number(s)
  if (!isFinite(n)) return null
  const cents = Math.round(n * 100)
  if (cents > 100_000_000_00) return null
  return cents
}

/** Toont centen als invoerwaarde, bijv. 1250 -> "12,50" */
export function centsToInput(c: Cents): string {
  return (c / 100).toFixed(2).replace('.', ',')
}

export function sum(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0)
}
