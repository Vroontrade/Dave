import { describe, it, expect } from 'vitest'
import { CloudStore } from './storage'
import { emptyData } from './defaults'
import { toggleItem, addTransaction } from './actions'
import { monthSummary, savingsStats } from './calc'

// Nep-collectie die zich gedraagt als de db-capability (volledige vervanging per document).
function fakeCollection() {
  const store = new Map<string, Record<string, unknown>>()
  let writes = 0
  return {
    store, writes: () => writes,
    doc: (id: string) => ({
      get: async () => ({ exists: store.has(id), data: () => store.get(id) }),
      set: async (d: Record<string, unknown>) => { writes++; store.set(id, JSON.parse(JSON.stringify(d))) },
      delete: async () => { store.delete(id) },
    }),
    get: async () => ({ docs: [...store.entries()].map(([id, d]) => ({ id, exists: true, data: () => d })) }),
  }
}

describe('Opslag in Claude-account', () => {
  it('slaat op, laadt terug en schrijft alleen gewijzigde documenten', async () => {
    const NOW = new Date(2027, 0, 15)
    const col = fakeCollection()
    const a = new CloudStore(col as never)
    const base = emptyData(NOW)
    base.settings.items = base.settings.items.map((i) => (i.id === 'savings' ? { ...i, amount: 60000 } : i))
    let d = toggleItem(base, '2027-01', 'savings', { date: '2027-01-05' }, NOW).data
    d = addTransaction(d, { type: 'savings_deposit', amount: 10000, date: '2027-01-25' }, NOW).data
    await a.save(d)
    const first = col.writes()
    expect([...col.store.keys()].every((k) => k.startsWith('fr-'))).toBe(true)
    await a.save(d)
    expect(col.writes()).toBe(first) // niets veranderd = geen schrijfacties
    const b = new CloudStore(col as never)
    const loaded = (await b.load())!
    expect(monthSummary(loaded, '2027-01').items.find((i) => i.item.id === 'savings')!.done).toBe(true)
    expect(savingsStats(loaded, NOW).balance).toBe(70000)
  })
})
